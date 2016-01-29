'use strict';

let cli   = require('heroku-cli-util');
let nock  = require('nock');
let cmd   = require('../../../commands/pipelines/update');

describe('pipelines:update', function () {
  beforeEach(function () {
    cli.mockConsole();
  });

  it('displays the right messages', function () {
    const app   = 'example';
    const id    = '0123';
    const stage = 'production';

    const pipeline_coupling = { id, stage };

    nock('https://api.heroku.com')
      .get(`/apps/${app}/pipeline-couplings`)
      .reply(200, pipeline_coupling);

    nock('https://api.heroku.com')
      .patch(`/pipeline-couplings/${id}`)
      .reply(200, pipeline_coupling);

    return cmd.run({app: app, flags: { stage }})
    .then(function () {
      cli.stderr.should.contain(`Changing ${app} to ${stage}... done`);
    });
  });
});
