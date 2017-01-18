const cli = require('heroku-cli-util')
const nock = require('nock')
const sinon = require('sinon')
const inquirer = require('inquirer')
const expect = require('chai').expect
const cmd = require('../../../commands/pipelines/setup')

describe('pipelines:setup', function () {
  beforeEach(function () {
    cli.mockConsole()
  })

  afterEach(function () {
    nock.cleanAll()
  })

  it('errors if the user is not linked to GitHub', function * () {
    try {
      yield cmd.run({ args: {} })
    } catch (error) {
      expect(error.message).to.equal('Account not connected to GitHub.')
    }
  })

  context('with an account connected to GitHub', function () {
    let pipeline, repo, archiveURL, prodApp, stagingApp, kolkrabbiAccount
    let api, kolkrabbi, github

    beforeEach(function () {
      archiveURL = 'https://example.com/archive.tar.gz'
      kolkrabbiAccount = { github: { token: '123-abc' } }

      pipeline = {
        id: '123-pipeline',
        name: 'my-pipeline'
      }

      repo = {
        id: 123,
        default_branch: 'master',
        name: 'my-org/my-repo'
      }

      prodApp = {
        id: '123-prod-app',
        name: pipeline.name
      }

      stagingApp = {
        id: '123-staging-app',
        name: `${pipeline.name}-staging`
      }

      kolkrabbi = nock('https://kolkrabbi.heroku.com')
      kolkrabbi.get('/account/github/token').reply(200, kolkrabbiAccount)
      kolkrabbi.post(`/pipelines/${pipeline.id}/repository`).reply(201, {})
      kolkrabbi.patch(`/apps/${stagingApp.id}/github`).reply(200, {})

      github = nock('https://api.github.com')
      github.get(`/repos/${repo.name}`).reply(200, repo)

      github.get(`/repos/${repo.name}/tarball/${repo.default_branch}`).reply(301, '', {
        location: archiveURL
      })

      api = nock('https://api.heroku.com')
      api.post('/pipelines').reply(201, pipeline)

      api.post('/app-setups', {
        source_blob: { url: archiveURL },
        app: { name: prodApp.name }
      }).reply(201, { app: prodApp })

      api.post('/app-setups', {
        source_blob: { url: archiveURL },
        app: { name: stagingApp.name }
      }).reply(201, { app: stagingApp })

      api.post('/pipeline-couplings', {
        pipeline: pipeline.id,
        app: prodApp.id,
        stage: 'production'
      }).reply(201, {})

      api.post('/pipeline-couplings', {
        pipeline: pipeline.id,
        app: stagingApp.id,
        stage: 'staging'
      }).reply(201, {})

      sinon.stub(inquirer, 'prompt').resolves({
        name: pipeline.name,
        repo: repo.name
      })
    })

    afterEach(function () {
      inquirer.prompt.restore()
    })

    it('runs', function* () {
      yield cmd.run({ args: {} })

      expect(cli.stdout).to.include(`heroku pipelines:open ${pipeline.id}`)

      api.done()
      github.done()
      kolkrabbi.done()
    })
  })
})
