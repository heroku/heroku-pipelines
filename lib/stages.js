const STAGES = [
  {
    name: 'development',
    inferRegex: /-(dev|development|uat|tst|test|qa)$/
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

const STAGE_NAMES     = STAGES.map((stage) => stage.name);
const ALL_STAGE_NAMES = ['review'].concat(STAGE_NAMES);

exports.stages        = STAGES;
exports.names         = STAGE_NAMES;
exports.allStageNames = ALL_STAGE_NAMES;
