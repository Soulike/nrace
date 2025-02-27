var fs = require('fs'),
    Relations = require('./Relations'),
    applyRules = require('./applyRules'),
    graphviz = require('./graphViz');

function buildHBGraph (args) {
    var asyncObjects = args.asyncObjects,
        promiseAllSet = args.promiseAllSet,
        promiseRaceSet = args.promiseRaceSet;

    var relations = new Relations(asyncObjects, promiseAllSet, promiseRaceSet);
    applyRules(asyncObjects, relations);

    //write hb results into files
    let hbFileName = args.file.replace('.log', '.hb-full.json')
    console.log(hbFileName);
    //fs.writeFileSync(hbFileName, JSON.stringify({ relations }, null, 4), 'utf-8');

    //visualize hb graph
    if (args.image) {
        let figName = args.file.replace('.log', '.hb-graph-full.png');
        console.log(figName);
        graphviz.drawGraph(figName, {nodes: asyncObjects.getAll(), edges: relations.hb});
    }

    return { hbFileName: hbFileName, relations: relations};
}

module.exports = buildHBGraph;