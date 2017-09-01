'use strict'

const co = require('co')
const cli = require('heroku-cli-util')
const disambiguate = require('../../lib/disambiguate')
const stageNames = require('../../lib/stages').names
const listPipelineApps = require('../../lib/api').listPipelineApps
const getTeam = require('../../lib/api').getTeam

// For user pipelines we need to use their couplings to determine user email
function getUserPipelineOwner (apps, userId) {
  for (let app in apps) {
    if (apps[app].owner.id === userId) {
      return apps[app].owner.email
    }
  }
}

module.exports = {
  topic: 'pipelines',
  command: 'info',
  description: 'show list of apps in a pipeline',
  help: `Example:

    $ heroku pipelines:info example
    === example
    Staging:     example-staging
    Production:  example
    example-admin`,
  needsAuth: true,
  args: [
    {name: 'pipeline', description: 'pipeline to show', optional: false}
  ],
  flags: [
    {name: 'json', description: 'output in json format'},
    {name: 'with-owners', description: 'shows owner of every app', hidden: true}
  ],
  run: cli.command(co.wrap(function* (context, heroku) {
    const pipeline = yield disambiguate(heroku, context.args.pipeline)

    const apps = yield listPipelineApps(heroku, pipeline.id)

    // Sort Apps by stage, name
    // Display in table
    let stages = {}
    let name

    for (let app in apps) {
      if (apps.hasOwnProperty(app)) {
        let stage = apps[app].coupling.stage
        name = apps[app].name

        if (context.flags['with-owners']) {
          name += ` (${apps[app].owner.email})`
        }

        if (stages[stage]) {
          stages[apps[app].coupling.stage].push(name)
        } else {
          stages[apps[app].coupling.stage] = [name]
        }
      }
    }

    if (context.flags.json) {
      cli.styledJSON({pipeline, apps})
    } else {
      cli.styledHeader(pipeline.name)
      if (pipeline.owner) {
        let owner

        if (pipeline.owner.type === 'team') {
          const team = yield getTeam(heroku, pipeline.owner.id)
          owner = `${team.name} (team)`
        } else {
          owner = getUserPipelineOwner(apps, pipeline.owner.id)
        }
        cli.log(`owner: ${owner}`)
      }

      cli.styledHash(stages, stageNames)
    }
  }))
}
