# Send Mocha test results to New Relic

## Description

Send Mocha JSON test results to [New Relic Log API](https://docs.newrelic.com/docs/logs/log-api/introduction-log-api/).

## Usage

```yaml
jobs:
  test:
    steps:
      # ...
      - name: Run tests
        run: mocha --reporter json --reporter-option="output=results.json"
      - uses: pavelsaman/send-mocha-test-results-to-nr@v1
        with:
          new-relic-license-key: ${{ secrets.NEWRELIC_LICENSE_KEY }}
```

## Inputs

### new-relic-license-key

New Relic license key for ingestion

**Required**: true

### test-result-filename

Filename with (Mocha) test results in JSON format.

**Required**: false

**Default**: `./results.json`

### fail-pipeline

Whether to fail the pipeline if there is a problem - e.g. when `test-result-filename` was not found.

**Required**: false

**Default**: `0` (do not fail)

### verbose-log

If set to `1`, prints more info to stdout - data sent to New Relic, GitHub properties. Useful for debugging only.

**Required**: false

**Default**: `0`

### upload-test-artifact

Whether to upload test artifact.

**Required**: false

**Default**: `1` (upload)

### job-id

Custom job id of the job this action was called from.

**Required**: false

### new-relic-dashboard-link

Link to New Relic dashboard that will be printed in step summary on Summary page.

**Required**: false

### new-relic-api-url

New Relic Log API url. Depends on where the data is stored, e.g. in EU (`https://log-api.eu.newrelic.com/log/v1`), or US (`https://log-api.newrelic.com/log/v1`).

**Required**: false

**Default**: `https://log-api.newrelic.com/log/v1`
