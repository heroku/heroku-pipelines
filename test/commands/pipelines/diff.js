'use strict';

const expect = require('chai').expect;
const cli    = require('heroku-cli-util');
const nock   = require('nock');
const cmd    = require('../../../commands/pipelines/diff');

describe('pipelines:diff', function () {
  const api = 'https://api.heroku.com';
  const kolkrabbiApi = 'https://kolkrabbi.heroku.com';
  const githubApi = 'https://api.github.com';

  const pipeline = {
    id: '123-pipeline-456',
    name: 'example-pipeline'
  };

  const targetApp = {
    id: '123-target-app-456',
    name: 'example-staging',
    coupling: { stage: 'staging' },
    pipeline: pipeline
  };

  const targetGithubApp = {
    repo: 'heroku/example-app'
  };

  const downstreamApp1 = {
    id: '123-downstream-app-1-456',
    name: 'example-production-eu',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const downstreamApp1Github = {
    repo: 'heroku/example-app'
  };

  const downstreamApp2 = {
    id: '123-downstream-app-2-456',
    name: 'example-production-us',
    coupling: { stage: 'production' },
    pipeline: pipeline
  };

  const downstreamApp2Github = {
    repo: 'heroku/some-other-app'
  };

  const targetCoupling = {
    app: targetApp,
    id: '123-target-app-456',
    pipeline: pipeline,
    stage: 'staging'
  };

  function mockPipelineCoupling() {
    return nock(api)
      .get(`/apps/${targetApp.name}/pipeline-couplings`)
      .reply(200, targetCoupling);
  }

  function mockApps() {
    nock(api)
      .get(`/pipelines/${pipeline.id}/apps`)
      .reply(200, [targetApp, downstreamApp1, downstreamApp2]);
  }

  function mockGithubAccount() {
    nock(kolkrabbiApi)
      .get(`/account/github/token`)
      .reply(200, { github: { token: 'github-token' } });
  }

  beforeEach(function () {
    cli.mockConsole();
  });

  after(function () {
    nock.cleanAll();
  });

  describe('for apps without a pipeline', function () {
    it('should return an error', function () {
      const req = nock(api)
        .get(`/apps/${targetApp.name}/pipeline-couplings`)
        .reply(404, { message: 'Not found.' });

      return cmd.run({ app: targetApp.name })
      .then(function () {
        req.done();
        expect(cli.stderr).to.contain('to be a part of any pipeline');
      });
    });
  });

  describe('for apps with a pipeline', function () {
    beforeEach(function () {
      mockPipelineCoupling();
    });
    it('should return an error for pipelines with no downstream apps', function () {
      nock(api)
        .get(`/pipelines/${pipeline.id}/apps`)
        .reply(200, [targetApp]);

      return cmd.run({ app: targetApp.name })
      .then(function () {
        expect(cli.stderr).to.contain('no downstream apps');
      });
    });
    it('should return an error if no GitHub account is associated', function () {
      mockApps();
      nock(kolkrabbiApi)
        .get(`/account/github/token`)
        .reply(404);
      return cmd.run({ app: targetApp.name })
      .then(function () {
        expect(cli.stderr).to.contain('You need to enable the GitHub integration');
      });
    });
  });

  describe('for invalid apps with a pipeline', function () {
    beforeEach(function () {
      mockPipelineCoupling();
      mockApps();
      mockGithubAccount();
    });

    it('should return an error if the app is not connected to GitHub', function () {
      const req = nock(kolkrabbiApi)
        .get(`/apps/${targetApp.id}/github`)
        .reply(404, { message: 'Not found.' });

        return cmd.run({ app: targetApp.name })
        .then(function () {
          req.done();
          expect(cli.stderr).to.contain('connected to GitHub');
        });
    });

    it('should return an error if the app has no release', function () {
      nock(kolkrabbiApi)
        .get(`/apps/${targetApp.id}/github`)
        .reply(200, targetGithubApp);
      const req = nock(api)
        .get(`/apps/${targetApp.id}/releases`)
        .reply(200, [{ slug: null }]);

      return cmd.run({ app: targetApp.name })
      .then(function () {
        req.done();
        expect(cli.stderr).to.contain('No release was found');
      });
    });
  });

  describe('for valid apps with a pipeline', function () {
    const targetSlugId = 'target-slug-id';
    const downstreamSlugId = 'downstream-slug-id';

    beforeEach(function () {
      mockPipelineCoupling();
      mockApps();
      mockGithubAccount();

      // Mock the GitHub apps for targetApp and downstreamApp1:
      nock(kolkrabbiApi)
        .get(`/apps/${targetApp.id}/github`)
        .reply(200, targetGithubApp)
        .get(`/apps/${downstreamApp1.id}/github`)
        .reply(200, downstreamApp1Github)
        .get(`/apps/${downstreamApp2.id}/github`)
        .reply(200, downstreamApp2Github);

      // Mock latest release/slug endpoints for two apps:
      nock(api)
        .get(`/apps/${targetApp.id}/releases`)
        .reply(200, [{ slug: { id: targetSlugId } }])
        .get(`/apps/${downstreamApp1.id}/releases`)
        .reply(200, [{ slug: { id: downstreamSlugId } }]);
    });

    it('should not compare apps if update to date NOR if repo differs', function () {
      const req1 = nock(api)
        .get(`/apps/${targetApp.id}/slugs/${targetSlugId}`)
        .reply(200, { commit: 'COMMIT-HASH' });
      const req2 = nock(api)
        .get(`/apps/${downstreamApp1.id}/slugs/${downstreamSlugId}`)
        .reply(200, { commit: 'COMMIT-HASH' });

      return cmd.run({ app: targetApp.name })
      .then(function () {
        req1.done();
        req2.done();

        expect(cli.stdout).to.contain(`${targetApp.name} is up to date with ${downstreamApp1.name}`);
        expect(cli.stdout).to.contain(`${targetApp.name} was not compared to ${downstreamApp2.name}`);
      });
    });

    it('should handle non-200 responses from GitHub', function () {
      const hashes = ['hash-1', 'hash-2'];
      nock(api)
        .get(`/apps/${targetApp.id}/slugs/${targetSlugId}`)
        .reply(200, { commit: hashes[0] })
        .get(`/apps/${downstreamApp1.id}/slugs/${downstreamSlugId}`)
        .reply(200, { commit: hashes[1] });

      const req = nock(githubApi)
        .get(`/repos/${targetGithubApp.repo}/compare/${hashes[1]}...${hashes[0]}`)
        .reply(404);

      return cmd.run({ app: targetApp.name })
      .then(function () {
        req.done();
        expect(cli.stdout).to.contain(`unable to perform a diff`);
      });
    });

  });

});
