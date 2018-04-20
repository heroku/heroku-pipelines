const cli = require('heroku-cli-util')
const nock = require('nock')
const expect = require('chai').expect
const cmd = require('../../../commands/ci/enable')

describe('ci:enable', function () {
  let pipeline, kolkrabbi, api

  beforeEach(function () {
    cli.mockConsole()
    nock.disableNetConnect()

    pipeline = {
      id: '123-pipeline',
      name: 'my-pipeline'
    }

    kolkrabbi = nock('https://kolkrabbi.heroku.com')
    kolkrabbi.patch(`/pipelines/${pipeline.id}/repository`).reply(200, {})

    api = nock('https://api.heroku.com')
    api.get(`/pipelines/${pipeline.name}`).reply(200, pipeline)
  })

  afterEach(function () {
    nock.cleanAll()
  })

  it('it succeeds with defaults', function () {
    return cmd.run({
      flags: {
        pipeline: pipeline.name
      }
    }).then(() => {
      expect(cli.stderr).to.include('Enabling CI')
    })
  })
})