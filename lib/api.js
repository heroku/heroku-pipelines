const V3_HEADER = 'application/vnd.heroku+json; version=3';
const PIPELINES_HEADER = V3_HEADER + '.pipelines';

function getCoupling(heroku, app) {
  return heroku.request({
    method: 'GET',
    path: `/apps/${app}/pipeline-couplings`,
    headers: { 'Accept': PIPELINES_HEADER }
  });
}

function patchCoupling(heroku, id, stage) {
  return heroku.request({
    method: 'PATCH',
    path: `/pipeline-couplings/${id}`,
    body: {stage: stage},
    headers: { 'Accept': PIPELINES_HEADER }
  });
}

function updateCoupling(heroku, app, stage) {
  return getCoupling(heroku, app)
           .then(coupling => patchCoupling(heroku, coupling.id, stage));
}

exports.getCoupling    = getCoupling;
exports.patchCoupling  = patchCoupling;

exports.updateCoupling = updateCoupling;
