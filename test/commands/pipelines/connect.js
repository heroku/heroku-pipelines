const cli = require('heroku-cli-util')
const nock = require('nock')
const expect = require('chai').expect
const cmd = require('../../../commands/pipelines/connect')

describe('pipelines:connect', function () {
  beforeEach(function () {
    cli.mockConsole()
    nock.disableNetConnect()
  })

  afterEach(function () {
    nock.cleanAll()
  })

  it('errors if the user is not linked to GitHub', function* () {
    try {
      yield cmd.run({
        args: {},
        flags: {}
      })
    } catch (error) {
      expect(error.message).to.equal('Account not connected to GitHub.')
    }
  })

  context('with an account connected to GitHub', function () {
    let pipeline, repo, kolkrabbiAccount, api, kolkrabbi, github

    function nockDone() {
      api.done()
      github.done()
      kolkrabbi.done()
    }

    beforeEach(function () {
      kolkrabbiAccount = {
        github: {
          token: '123-abc'
        }
      }

      pipeline = {
        id: '123-pipeline',
        name: 'my-pipeline'
      }

      repo = {
        id: 123,
        default_branch: 'master',
        name: 'my-org/my-repo'
      }

      kolkrabbi = nock('https://kolkrabbi.heroku.com')
      kolkrabbi.get('/account/github/token').reply(200, kolkrabbiAccount)
      kolkrabbi.post(`/pipelines/${pipeline.id}/repository`).reply(201, {})

      github = nock('https://api.github.com')

      github.get(`/repos/${repo.name}`).reply(200, repo)

      api = nock('https://api.heroku.com')

      nock('https://api.heroku.com')
        .get(`/pipelines?eq[name]=${pipeline.name}`)
        .reply(200, [{
          id: pipeline.id,
          name: pipeline.name
        }])
    })

    context('in a personal account', function () {

      beforeEach(function () {
        api.get('/users/~').reply(200, {
          id: '1234-567'
        })
      })

      it('shows success', function* () {

        return cmd.run({
          args: {
            name: pipeline.name,
            repo: repo.name
          },
          flags: {}
        }).then(() => {
          expect(cli.stderr).to.include('Getting pipeline ID...')
          expect(cli.stderr).to.include('Linking to repo...')
          expect(cli.stdout).to.equal('')
        })
      })
    })

    context('in a team', function () {

      let team

      beforeEach(function () {
        team = 'test-org'
        api.get('/teams/test-org').reply(200, {
          id: '89-0123-456'
        })
      })

      it('shows success', function* () {

        return cmd.run({
          args: {
            name: pipeline.name,
            repo: repo.name
          },
          flags: {
            team
          }
        }).then(() => {
          expect(cli.stderr).to.include('Getting pipeline ID...')
          expect(cli.stderr).to.include('Linking to repo...')
          expect(cli.stdout).to.equal('')
        })
      })
    })

  })

})