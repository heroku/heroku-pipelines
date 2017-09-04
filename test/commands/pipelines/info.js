'use strict'

const cli = require('heroku-cli-util')
const nock = require('nock')
const cmd = require('../../../commands/pipelines/info')

describe('pipelines:info', function () {
  let pipelines, couplings, apps

  beforeEach(function () {
    cli.mockConsole()
  })

  function setup (pipeline) {
    pipelines = [ pipeline ]

    couplings = [
      { stage: 'staging', app: { id: 'app-1' } },
      { stage: 'production', app: { id: 'app-2' } },
      { stage: 'production', app: { id: 'app-3' } }
    ]

    apps = [
      {
        id: 'app-1',
        name: 'example-staging',
        pipeline: pipeline,
        owner: { id: '1234', email: 'foo@user.com' }
      },
      {
        id: 'app-2',
        name: 'example',
        pipeline: pipeline,
        owner: { id: '1234', email: 'foo@user.com' }
      },
      {
        id: 'app-3',
        name: 'example-admin',
        pipeline: pipeline,
        owner: { id: '1234', email: 'foo@user.com' }
      }
    ]
  }

  context(`when pipeline doesn't have an owner`, function () {
    const pipeline = { name: 'example', id: '0123' }

    beforeEach(function () {
      setup(pipeline)
    })

    it('displays the pipeline info and apps', function () {
      let api = nock('https://api.heroku.com')
      .get('/pipelines')
      .query(true)
      .reply(200, pipelines)
      .get('/pipelines/0123/pipeline-couplings')
      .reply(200, couplings)
      .post('/filters/apps')
      .reply(200, apps)

      return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
        cli.stdout.should.contain('example-staging')
        cli.stdout.should.contain('staging')
      })
      .then(() => api.done())
    })

    it('displays json format', function () {
      let api = nock('https://api.heroku.com')
      .get('/pipelines')
      .query(true)
      .reply(200, pipelines)
      .get('/pipelines/0123/pipeline-couplings')
      .reply(200, couplings)
      .post('/filters/apps')
      .reply(200, apps)

      return cmd.run({ args: { pipeline: 'example' }, flags: { json: true } })
      .then(() => JSON.parse(cli.stdout).pipeline.name.should.eq('example'))
      .then(() => api.done())
    })
  })

  context('when it has an owner', function () {
    const pipeline = { name: 'example', id: '0123', owner: { id: '1234', type: 'user' } }

    beforeEach(function () {
      setup(pipeline)
    })

    it('displays the owner', function () {
      let api = nock('https://api.heroku.com')
      .get('/pipelines')
      .query(true)
      .reply(200, pipelines)
      .get('/pipelines/0123/pipeline-couplings')
      .reply(200, couplings)
      .post('/filters/apps')
      .reply(200, apps)

      return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
        cli.stdout.should.contain('owner: foo@user.com')
      })
      .then(() => api.done())
    })
  })
})
