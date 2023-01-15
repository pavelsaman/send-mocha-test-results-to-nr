import fs from 'fs';
import axios from 'axios';
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';
import { config } from './config';
import { TestResult, TestResults, GitHubProperties, TestResultsForNR } from './types';
import { randomUUID } from 'crypto';

const desiredExitCode = core.getInput('fail-pipeline') === '1' ? 1 : 0;
const verboseLog = core.getInput('verbose-log') === '1' ? true : false;
const jobId = core.getInput('job-id') || github.context.job;
const newRelicDashboardLink = core.getInput('new-relic-dashboard-link') || config.newRelicDashboardUrl;
const newRelicapiUrl = core.getInput('new-relic-api-url');

const addLeadingZero = (datePart: string): string => {
  if (datePart.length === 1) {
    return `0${datePart}`;
  }

  return datePart;
};
const timestamp = (): number => Math.round(Date.now());
const getFormattedTime = (): string => {
  const now = new Date();

  const year = String(now.getUTCFullYear());
  const month = addLeadingZero(String(now.getUTCMonth() + 1));
  const day = addLeadingZero(String(now.getUTCDate()));
  const hour = addLeadingZero(String(now.getUTCHours()));
  const minute = addLeadingZero(String(now.getUTCMinutes()));
  const second = addLeadingZero(String(now.getUTCSeconds()));

  return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
};
const isPullRequest = (githubBranch: string): boolean => githubBranch.startsWith('refs/pull/');
const isRelease = (githubBranch: string): boolean => githubBranch.startsWith('refs/tags/');
const testCaseFailed = (testCase: TestResult): boolean => (Object.keys(testCase.err).length === 0 ? false : true);
const isPending = (testCase: TestResult): boolean => testCase.duration === undefined;
const removePathToProject = (filePath: string | undefined): string | undefined => {
  if (filePath !== undefined) {
    return filePath.replace(config.filePathToProject, '');
  }

  return undefined;
};

function printWarningMessage(message: string): void {
  core.warning(`${github.context.action}: ${message}`);
}

function getFileLink(filePath: string | undefined): string | undefined {
  const filePathFromProjectRoot = removePathToProject(filePath);

  if (filePathFromProjectRoot === undefined) {
    return undefined;
  }

  const fileLink = config.urlToFileAtCommit
    .replace('{commit}', github.context.sha)
    .replace('{filePath}', filePathFromProjectRoot);

  return `<a href="${fileLink}">${filePathFromProjectRoot}</a>`;
}

async function printFailures(failures: TestResult[]): Promise<void> {
  if (failures.length === 0) {
    return;
  }

  const stepSummaryFailures = [];
  let failuresAsString = 'Failed test cases:\n\n';
  for (const failure of failures) {
    const fileLink = getFileLink(failure.file) || '-';
    const fileFromRoot = removePathToProject(failure.file);

    failuresAsString += `${fileFromRoot}\n${failure.fullTitle}\n${failure.err?.message}\n${failure.err?.stack}\n---\n`;

    stepSummaryFailures.push([
      fileLink,
      failure.title,
      failure.fullTitle,
      failure.duration.toString(),
      failure.err?.message ? failure.err?.message : '-',
    ]);
  }
  core.error(failuresAsString);

  await core.summary
    .addHeading(':test_tube: Failed test cases')
    .addTable([
      [
        { data: 'File', header: true },
        { data: 'Test title', header: true },
        { data: 'Test full title', header: true },
        { data: 'Test duration [ms]', header: true },
        { data: 'Error message', header: true },
      ],
      ...stepSummaryFailures,
    ])
    .addLink('For overall stats, see NewRelic dashboard', newRelicDashboardLink)
    .write();
}

function getGithubProperties(): GitHubProperties {
  if (verboseLog) {
    console.log(github.context);
  }

  let githubBranch = github.context.ref.replace(/^refs\/heads\//, '');
  if (isPullRequest(githubBranch) || isRelease(githubBranch)) {
    githubBranch = github.context.payload?.pull_request?.head?.ref;
  }

  return {
    'git.branch': githubBranch,
    'git.ref': github.context.ref,
    'git.sha': github.context.sha,
    'github.action': github.context.action,
    'github.workflow': github.context.workflow,
    'github.project': github.context.repo.repo,
    'github.job': jobId,
    'github.eventName': github.context.eventName,
    'github.actor': github.context.actor,
    'github.runId': github.context.runId,
    'github.runNumber': github.context.runNumber,
    'github.runAttempt': Number(process.env.GITHUB_RUN_ATTEMPT),
    'github.runner.arch': process.env.RUNNER_ARCH,
    'github.runner.os': process.env.RUNNER_OS,
    'github.runner.name': process.env.RUNNER_NAME,
  };
}

function readResults(fileName: string): TestResults | undefined {
  try {
    const rawTestResults = fs.readFileSync(fileName);
    if (verboseLog) {
      console.log(rawTestResults.toString());
    }
    return JSON.parse(rawTestResults.toString());
  } catch (err) {
    return undefined;
  }
}

function testResultsAreParsable(data: TestResults): boolean {
  if (!data.tests) {
    return false;
  }

  if (!data.failures) {
    return false;
  }

  return true;
}

function assembleResults(data: TestResults): TestResultsForNR[] {
  /*
   * data.tests - does not contain failures in hooks,
   *  contains pending (skipped) tests
   * data.failures - contains both failed tests and hooks
   * data.pending - skipped tests
   */
  const passedTests = data.tests.filter((test) => !(testCaseFailed(test) || isPending(test)));
  const pendingTests = data.tests.filter((test) => isPending(test));

  const passedTestsNRFormat = passedTests.map((test) => {
    return {
      message: 'action-nr-test-results: test case PASSED',
      attributes: {
        testFile: removePathToProject(test.file),
        testSuite: test.fullTitle?.replace(test.title, '').trim(),
        testTitle: test.title,
        testFullTitle: test.fullTitle,
        testFailure: false,
        testDuration: test.duration,
      },
    };
  });

  const pendingTestsNRFormat = pendingTests.map((test) => {
    return {
      message: 'action-nr-test-results: test case SKIPPED',
      attributes: {
        testFile: removePathToProject(test.file),
        testSuite: test.fullTitle?.replace(test.title, '').trim(),
        testTitle: test.title,
        testFullTitle: test.fullTitle,
        testFailure: false,
        testDuration: null,
      },
    };
  });

  const failuresNRFormat = data.failures.map((test) => {
    return {
      message: 'action-nr-test-results: test case FAILED',
      attributes: {
        testFile: removePathToProject(test.file),
        testSuite: test.fullTitle?.replace(test.title, '').trim(),
        testTitle: test.title,
        testFullTitle: test.fullTitle,
        testFailure: true,
        testDuration: test.duration,
        errorMessage: test.err?.message,
        errorStack: test.err?.stack,
      },
    };
  });

  const testResults = [...passedTestsNRFormat, ...pendingTestsNRFormat, ...failuresNRFormat];

  // I can get 413 Payload Too Large response code in New Relic
  const buckets = [];
  while (testResults.length > 0) {
    buckets.push([
      {
        logs: testResults.splice(0, config.maxTestCasesPerRequest),
        common: {
          logType: 'test.case',
          timestamp: timestamp(),
          attributes: getGithubProperties(),
        },
      },
    ]);
  }

  return buckets;
}

async function sendResultsToNR(resultsForNR: TestResultsForNR[]): Promise<void> {
  if (verboseLog) {
    console.log(`Sending ${resultsForNR.length} requests to New Relic.`);
    console.log(JSON.stringify(resultsForNR));
  }

  for (const bucket of resultsForNR) {
    if (verboseLog) {
      console.log(JSON.stringify(bucket));
    }

    let continueRetrying = true;
    let currentRequestAttempt = 0;

    while (continueRetrying && currentRequestAttempt < config.maxRequestRetries) {
      currentRequestAttempt++;

      try {
        const response = await axios({
          url: newRelicapiUrl,
          method: 'POST',
          headers: {
            'Api-Key': core.getInput('new-relic-license-key'),
          },
          data: JSON.stringify(bucket),
          timeout: 1, //config.axiosTimeoutMs,
        });

        continueRetrying = false;
        core.info(
          `${github.context.action}: Attempt ${currentRequestAttempt} succeeded: ${response.status}\n${JSON.stringify(
            response.data,
          )}`,
        );
      } catch (err) {
        continueRetrying = true;
        printWarningMessage(`Attempt ${currentRequestAttempt} failed with:\n${err.stack}`);
      }
    }

    if (continueRetrying) {
      const artifactName = `batch_${randomUUID()}_${jobId}_${getFormattedTime()}`;
      fs.writeFileSync(artifactName, JSON.stringify(bucket));
      await uploadArtifact(artifactName, artifactName);

      printWarningMessage(
        `All ${currentRequestAttempt} request to NR failed. This batch of data will not be in NewRelic! You can find this batch of data in "${artifactName}" artifact.`,
      );
    }
  }
}

async function uploadArtifact(artifactName: string, fileNamesToUpload: string): Promise<void> {
  const artifactClient = artifact.create();
  const rootDirectory = '.';
  const options = {
    continueOnError: false,
  };

  await artifactClient.uploadArtifact(artifactName, [fileNamesToUpload], rootDirectory, options);
}

async function run(): Promise<void> {
  const fileName = core.getInput('test-result-filename');
  const testResults = readResults(fileName);

  if (!testResults) {
    printWarningMessage(`${fileName} not found.`);
    process.exit(desiredExitCode);
  }

  if (core.getInput('upload-test-artifact') === '1') {
    await uploadArtifact(`test_results_${jobId}_${getFormattedTime()}`, fileName);
  }

  if (!testResultsAreParsable(testResults)) {
    printWarningMessage('Test data are not in the correct format.');
    process.exit(desiredExitCode);
  }

  await printFailures(testResults.failures);

  const logsForNR = assembleResults(testResults);
  await sendResultsToNR(logsForNR);
}

run();
