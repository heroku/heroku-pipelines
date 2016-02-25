const V3_HEADER = 'application/vnd.heroku+json; version=3';
const FILTERS_HEADER = V3_HEADER + '.filters';

function getCoupling(heroku, app) {
  return heroku.request({
    method: 'GET',
    path: `/apps/${app}/pipeline-couplings`,
    headers: { 'Accept': V3_HEADER }
  });
}

function postCoupling(heroku, pipeline, app, stage) {
  return heroku.request({
    method: 'POST',
    path: '/pipeline-couplings',
    body: {app: app, pipeline: pipeline, stage: stage},
    headers: { 'Accept': V3_HEADER }
  });
}

function patchCoupling(heroku, id, stage) {
  return heroku.request({
    method: 'PATCH',
    path: `/pipeline-couplings/${id}`,
    body: {stage: stage},
    headers: { 'Accept': V3_HEADER }
  });
}

function deleteCoupling(heroku, id) {
  return heroku.request({
    method: 'DELETE',
    path: `/pipeline-couplings/${id}`,
    headers: { 'Accept': V3_HEADER }
  });
}

function createCoupling(heroku, pipeline, app, stage) {
  return postCoupling(heroku, pipeline.id, app, stage);
}

function updateCoupling(heroku, app, stage) {
  return getCoupling(heroku, app)
           .then(coupling => patchCoupling(heroku, coupling.id, stage));
}

function removeCoupling(heroku, app) {
  return getCoupling(heroku, app)
           .then(coupling => deleteCoupling(heroku, coupling.id));
}

function getPipelineCouplings(heroku, pipelineId) {
  return heroku.request({
    method: 'GET',
    path: `/pipelines/${pipelineId}/pipeline-couplings`,
    headers: { 'Accept': V3_HEADER }
  });
}

function getAppFitler(heroku, appIds) {
  return heroku.request({
    method: 'POST',
    path: `/filters/apps`,
    headers: { 'Accept': FILTERS_HEADER },
    body: { in: { id: appIds } }
  });
}

function getPipelineApps(heroku, pipelineId) {
  return getPipelineCouplings(heroku, pipelineId).then((couplings) => {
    const appIds = couplings.map((coupling) => coupling.app.id);

    return getAppFitler(heroku, appIds).then((apps) => {
      const couplingsByAppId = couplings.reduce((memo, coupling) => {
        memo[coupling.app.id] = coupling;
        return memo;
      }, {});

      apps.forEach((app) => app.coupling = couplingsByAppId[app.id]);

      return apps;
    });
  });
}

exports.getCoupling    = getCoupling;
exports.postCoupling   = postCoupling;
exports.patchCoupling  = patchCoupling;
exports.deleteCoupling = deleteCoupling;

exports.createCoupling = createCoupling;
exports.updateCoupling = updateCoupling;
exports.removeCoupling = removeCoupling;

exports.getPipelineCouplings = getPipelineCouplings;

exports.getAppFitler = getAppFitler;

exports.getPipelineApps = getPipelineApps;
