'use strict'

const cli = require('heroku-cli-util')
const nock = require('nock')
const cmd = require('../../../commands/pipelines/info')

describe.only('pipelines:info', function () {
  let pipelines, couplings, apps, api, pipeline, stage

  function itShowsPipelineApps () {
    it('displays the pipeline info and apps', function () {
      return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
        cli.stdout.should.contain('example-staging')
      }).then(() => api.done())
    })

    it('displays json format', function () {
      return cmd.run({ args: { pipeline: 'example' }, flags: { json: true } })
      .then(() => JSON.parse(cli.stdout).pipeline.name.should.eq('example'))
      .then(() => api.done())
    })

    it('shows all stages', function () {
      return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
        cli.stdout.should.contain('exampleasdfasdf-staging')
      }).then(() => api.done())
    })
  }

  function setup (pipeline) {
    pipelines = [ pipeline ]
    couplings = []
    apps = []

    const appNames = [
      'development-app-1',
      'development-app-2',
      'review-app-1',
      'review-app-2',
      'review-app-3',
      'review-app-4',
      'staging-app-1',
      'staging-app-2',
      'production-app-1'
    ]

    // Build couplings
    appNames.forEach((id) => {
      stage = id.split('-')[0]
      couplings.push({
        stage,
        app: { id }
      })
    })
    console.log(`couplings: ${couplings}`)

    // Build apps
    appNames.forEach((name, id) => {
      apps.push(
        {
          id: `app-${id + 1}`,
          name,
          pipeline: pipeline,
          owner: { id: '1234', email: 'foo@user.com' }
        }
      )
    })

    console.log(`apps: ${apps}`)

    api
    .get('/pipelines')
    .query(true)
    .reply(200, pipelines)
    .get('/pipelines/0123/pipeline-couplings')
    .reply(200, couplings)
    .post('/filters/apps')
    .reply(200, apps)
  }

  beforeEach(function () {
    cli.mockConsole()
    api = nock('https://api.heroku.com')
  })

  context(`when pipeline doesn't have an owner`, function () {
    beforeEach(function () {
      pipeline = { name: 'example', id: '0123' }
      setup(pipeline)
    })

    it.only(`doesn't display the owner`, function () {
      return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
        cli.stdout.should.not.contain('owner: foo@user.com')
      }).then(() => api.done())
    })

    itShowsPipelineApps()
  })

  context('when it has an owner', function () {
    context('and type is user', function () {
      beforeEach(function () {
        pipeline = { name: 'example', id: '0123', owner: { id: '1234', type: 'user' } }
        setup(pipeline)
      })
    })

    context('and type is team', function () {
      let team = {
        id: '1234',
        name: 'my-team'
      }

      beforeEach(function () {
        pipeline = { name: 'example', id: '0123', owner: { id: '1234', type: 'team' } }
        api.get('/teams/1234').reply(200, team)
        setup(pipeline)
      })

      it('displays the owner', function () {
        return cmd.run({ args: { pipeline: 'example' }, flags: {} }).then(() => {
          cli.stdout.should.contain('owner: my-team (team)')
        }).then(() => api.done())
      })

      itShowsPipelineApps()
    })
  })
})
