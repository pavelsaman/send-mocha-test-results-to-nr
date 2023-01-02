type ErrorAttributes = {
  stack?: string;
  message?: string;
};

type TestResultForNR = {
  message: string;
  attributes: TestResultAttributesForNR;
};

type TestResultAttributesForNR = {
  testFile: string | undefined;
  testSuite: string;
  testTitle: string;
  testFullTitle: string;
  testFailure: boolean;
  testDuration: number | null;
  errorMessage?: string;
  errorStack?: string;
};

export type TestResult = {
  file: string;
  title: string;
  fullTitle: string;
  duration: number;
  err: ErrorAttributes;
};

export type TestResults = {
  tests: TestResult[];
  failures: TestResult[];
};

export type GitHubProperties = {
  'git.branch': string;
  'git.ref': string;
  'git.sha': string;
  'github.action': string;
  'github.workflow': string;
  'github.project': string;
  'github.job': string;
  'github.eventName': string;
  'github.actor': string;
  'github.runId': number;
  'github.runNumber': number;
  'github.runAttempt': number | undefined;
  'github.runner.arch': string | undefined;
  'github.runner.os': string | undefined;
  'github.runner.name': string | undefined;
};

export type TestResultsForNR = {
  logs: TestResultForNR[];
  common: {
    logType: string;
    timestamp: number;
    attributes: GitHubProperties;
  };
}[];
