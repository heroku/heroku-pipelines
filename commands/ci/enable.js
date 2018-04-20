const cli = require('heroku-cli-util')
const co = require('co')
const { flags } = require('@heroku-cli/command')
const api = require('../../lib/api')
const KolkrabbiAPI = require('../../lib/kolkrabbi-api')

module.exports = {
  topic: 'ci',
  command: 'enable',
  description: 'enable ci on an existing pipeline',
  help: `Example:

    $ heroku ci:enable -p mypipeline
    Enabling CI ... done`,
  needsApp: false,
  needsAuth: true,
  wantsOrg: false,
  args: [],
  flags: [
    flags.pipeline({ name: 'pipeline', required: true, hasValue: true })
  ],
  run: cli.command(co.wrap(function* (context, heroku) {
    const kolkrabbi = new KolkrabbiAPI(context.version, heroku.options.token)
    const pipelines = yield api.getPipeline(heroku, context.flags.pipeline)
    const settings = { ci: true }

    yield cli.action(
      'Enabling CI',
      kolkrabbi.updatePipelineRepository(pipelines.id, settings)
    )
  }))
}
