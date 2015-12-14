const STAGES = [
  {
    name: 'review',
    inferRegex:  /-pr-(\d+)$/
  },
  {
    name: 'development',
    inferRegex: /-(dev|development)$/
  },
  {
    name: 'test',
    inferRegex: /-(uat|tst|test)$/
  },
  {
    name: 'qa',
    inferRegex: /-qa$/
  },
  {
    name: 'staging',
    inferRegex: /-(stg|staging)$/
  },
  {
    name: 'production',
    inferRegex: /-(prd|prod|production|admin|demo)$/
  }
];

exports.stages = STAGES;
exports.names  = STAGES.map((stage) => stage.name);
