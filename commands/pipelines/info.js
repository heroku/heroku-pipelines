'use strict';

let cli       = require('heroku-cli-util');
let validator = require('validator');
let inquirer  = require("inquirer");

module.exports = {
  topic: 'pipelines',
  command: 'info',
  description: 'show detailed pipeline info',
  help: 'show detailed pipeline info',
  needsAuth: true,
  args: [
    {name: 'pipeline', description: 'pipeline to show', optional: false}
  ],
  run: cli.command(function* (context, heroku) {
    let pipeline_id_or_name = context.args.pipeline;
    var pipeline;
    if(validator.isUUID(pipeline_id_or_name)) {
      pipeline = yield heroku.request({
        method: 'GET',
        path: `/pipelines/${pipeline_id_or_name}`,
        headers: { 'Accept': 'application/vnd.heroku+json; version=3.pipelines' }
      }); // heroku.pipelines(pipeline_id_or_name).info();
    } else {
      let pipelines = yield heroku.request({
        method: 'GET',
        path: `/pipelines?eq[name]=${pipeline_id_or_name}`,
        headers: { 'Accept': 'application/vnd.heroku+json; version=3.pipelines' }
      });
      if(pipelines.length == 0) {
        throw new Error('Pipeline not found');
      } else if (pipelines.length == 1) {
        pipeline = pipelines[0];
      } else {
        // Disambiguate
        let questions = [{
          type: "list",
          name: "pipeline",
          message: `Which pipeline?`,
          choices: pipelines.map(function(x) {return {name: new Date(x.created_at), value: x}})
        }];
        yield inquirer.prompt( questions, function ( answers ) {
          if (answers.pipeline) pipeline = answers.pipeline;
          else throw new Error('Must pick a pipeline');
        });
      }
    }
    let apps = yield heroku.request({
      method: 'GET',
      path: `/pipelines/${pipeline.id}/apps`,
      headers: { 'Accept': 'application/vnd.heroku+json; version=3.pipelines' }
    }); // heroku.pipelines(pipeline_id).apps();
    cli.styledHeader(pipeline.name);
    // Sort Apps by stage, name
    // Display in table
    let stages={};
    for (var app in apps) {
      if (apps.hasOwnProperty(app)) {
        let stage = apps[app].coupling.stage;
        if(stages[stage]) {
          stages[apps[app].coupling.stage].push(apps[app].name);
        } else {
          stages[apps[app].coupling.stage] = [apps[app].name];
        }
      }
    }
    // Pass in sort order for stages
    cli.styledHash(stages, ["review", "development", "test", "qa", "staging", "production"]);
  })
};
