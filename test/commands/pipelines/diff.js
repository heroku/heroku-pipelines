'use strict';

const expect = require('chai').expect;
const cli    = require('heroku-cli-util');
const nock   = require('nock');
const cmd    = require('../../../commands/pipelines/diff');

describe('pipelines:diff', function () {
  const api = 'https://api.heroku.com';

  const pipeline = {
    id: '123-pipeline-456',
    name: 'example-pipeline'
  };

  const targetApp = {
    id: '123-source-app-456',
    name: 'example-staging',
    coupling: { stage: 'staging' },
    pipeline: pipeline
  };

  /*
  const downstreamApp1 = {
    id: '123-target-app-456',
    name: 'example-production-us',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const downstreamApp2 = {
    id: '456-target-app-789',
    name: 'example-production-eu',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const targetCoupling = {
    app: targetApp,
    id: '123-source-app-456',
    pipeline: pipeline,
    stage: 'staging'
  };
  */

  beforeEach(function () {
    cli.mockConsole();
    /*
    nock(api)
      .get(`/apps/${targetApp.name}/pipeline-couplings`)
      .reply(200, targetCoupling);

    nock(api)
      .get(`/pipelines/${pipeline.id}/apps`)
      .reply(200, [targetApp, downstreamApp1, downstreamApp2]);
    */
  });

  after(function () {
    nock.cleanAll();
  });

  it('should throw an error if the target app has no pipeline', function () {
    const req = nock(api)
      .get(`/apps/${targetApp.name}/pipeline-couplings`)
      .reply(404, { message: 'Not found.' });

      return cmd.run({ app: targetApp.name })
      .then(function () {
        req.done()
        expect(cli.stderr).to.contain('to be a part of any pipeline');
      });
  });

});
