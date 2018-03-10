const cli = require('heroku-cli-util')
const nock = require('nock')
const sinon = require('sinon')
const inquirer = require('inquirer')
const expect = require('chai').expect

const cmd = require('../../../commands/pipelines/reviewApps')

describe('pipelines:reviewapps', function () {

  let pipeline, repo, app, kolkrabbiAccount
  let api, kolkrabbi, github

  function nockDone() {
    api.done()
    github.done()
    kolkrabbi.done()
  }

  beforeEach(function () {

    cli.mockConsole()
    nock.disableNetConnect()
    sinon.stub(cli, 'open').returns(Promise.resolve())

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

    app = {
      id: '123-prod-app',
      name: pipeline.name
    }

    kolkrabbi = nock('https://kolkrabbi.heroku.com')
    kolkrabbi.get('/account/github/token').reply(200, kolkrabbiAccount)
    // kolkrabbi.post(`/pipelines/${pipeline.id}/repository`).reply(201, {})
    kolkrabbi.patch(`/apps/${app.id}/github`).reply(200, {})

    github = nock('https://api.github.com')

    sinon.stub(inquirer, 'prompt').resolves({
      name: pipeline.name,
      app: app.name
    })
  })

  afterEach(function () {
    nock.cleanAll()
    cli.open.restore()
    inquirer.prompt.restore()
  })

  context('and pipeline name is valid', function () {
    beforeEach(function () {

      api = nock('https://api.heroku.com')
      api.get(`/apps/${app.name}`).reply(200, app)

    })

    it('fails if you do not specify either enable or disable', function* () {
      return cmd.run({
        args: {
          name: pipeline.name
        },
        flags: {
          app: app.name
        }
      }).then(() => {
        expect(cli.stderr).to.include('You must chose to either enable or disable review apps')
        expect(cli.stdout).to.equal('')
      })
    })

    it('fails if you specify both enable or disable', function* () {
      return cmd.run({
        args: {
          name: pipeline.name
        },
        flags: {
          app: app.name,
          enable: true,
          disable: true
        }
      }).then(() => {
        expect(cli.stderr).to.include('You must chose to either enable or disable review apps')
        expect(cli.stdout).to.equal('')
      })
    })

    context('is enabled', function () {

      context('uses default settings', function () {

        it('it succeeds', function* () {

          return cmd.run({
            args: {
              name: pipeline.name
            },
            flags: {
              app: app.name,
              enable: true
            }
          }).then(() => {
            expect(cli.stdout).to.include('Enabling review apps')
            expect(cli.stdout).to.include('Using default settings')
            expect(cli.stderr).to.include('Configuring pipeline')
          })

        })

      })

      context('it does not use defaults', function () {

        it('it autodeploys', function* () {

          return cmd.run({
            args: {
              name: pipeline.name
            },
            flags: {
              app: app.name,
              enable: true,
              autodeploy: true
            }
          }).then(() => {
            expect(cli.stdout).to.include('Enabling auto deployment')
            expect(cli.stderr).to.include('Configuring pipeline')
          })

        })

      })

    })

    context('is disabled', function () {

      it('it succeeds', function* () {

        return cmd.run({
          args: {
            name: pipeline.name
          },
          flags: {
            app: app.name,
            disable: true
          }
        }).then(() => {
          expect(cli.stdout).to.equal('Disabling review apps ...\n')
          expect(cli.stderr).to.include('Configuring pipeline')
        })

      })

      it('it fails if autodeploy is enabled', function* () {

        return cmd.run({
          args: {
            name: pipeline.name
          },
          flags: {
            app: app.name,
            disable: true,
            autodeploy: true
          }
        }).then(() => {
          expect(cli.stdout).to.equal('')
          expect(cli.stderr).to.include('You cannot set autodeploy when disabling review apps')
        })

      })

      it('it fails if autodestroy is enabled', function* () {

        return cmd.run({
          args: {
            name: pipeline.name
          },
          flags: {
            app: app.name,
            disable: true,
            autodestroy: true
          }
        }).then(() => {
          expect(cli.stdout).to.equal('')
          expect(cli.stderr).to.include('You cannot set autodestroy when disabling review apps')
        })

      })
    })
  })
})