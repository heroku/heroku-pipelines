'use strict';

const cli  = require('heroku-cli-util');
const nock = require('nock');
const cmd  = require('../../../commands/pipelines/promote');

describe('pipelines:promote', function() {
  const pipeline = {
    id: '123-pipeline-456',
    name: 'example-pipeline'
  };

  const sourceApp = {
    id: '123-source-app-456',
    name: 'example-staging',
    coupling: { stage: 'staging' },
    pipeline: pipeline
  };

  const targetApp1 = {
    id: '123-target-app-456',
    name: 'example-production',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const targetApp2 = {
    id: '456-target-app-789',
    name: 'example-production-eu',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const sourceCoupling = {
    app: sourceApp,
    id: '123-source-app-456',
    pipeline: pipeline,
    stage: 'staging'
  };

  const promotion = {
    id: '123-promotion-456',
    source: { app: sourceApp },
    status: 'pending'
  };

  beforeEach(function () {
    cli.mockConsole();
  });

  it('promotes to all apps in the next stage', function() {
    nock('https://api.heroku.com')
      .get(`/apps/${sourceApp.name}/pipeline-couplings`)
      .reply(200, sourceCoupling);

    nock('https://api.heroku.com')
      .get(`/pipelines/${pipeline.id}/apps`)
      .reply(200, [sourceApp, targetApp1, targetApp2]);

    const req = nock('https://api.heroku.com').post('/pipeline-promotions', {
      pipeline: { id: pipeline.id },
      source:   { app: { id: sourceApp.id } },
      targets:  [
        { app: { id: targetApp1.id } },
        { app: { id: targetApp2.id } }
      ]
    }).reply(201, promotion);

    return cmd.run({ app: sourceApp.name }).then(req.done);
  });
});
