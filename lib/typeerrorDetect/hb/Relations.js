const _ = require('lodash');
const Graph = require('@dagrejs/graphlib').Graph;
const dijkstraAll = require('@dagrejs/graphlib').alg.dijkstraAll;
const dijkstra = require('@dagrejs/graphlib').alg.dijkstra;
var Matrix = require('./Matrix');

class Relations {
    constructor (asyncObjs, promiseAllSet, promiseRaceSet, hb, chains, sync, actions) {
        //this.hb = new Array();
        this.asyncObjs = asyncObjs;
        if (arguments.length == 3) {
            this.hb = new Array();
            this.chains = {};
            this.sync = {};
            this.nodes = [];
            this.isUsedMatrix = true;
            this.initNodesForHBConstruction();
        } else {
            this.hb = hb;
            this.chains = chains;
            this.sync = sync;
            this.actions = actions;
            this.initNodes();
            this.isUsedMatrix = true;
            this.hb_check = 0;
            this.hb_call = 0;
            this.iteration = 0
        }
        if (this.isUsedMatrix) this.matrix = new Matrix(this.events_num);
        this.promiseAllSet = promiseAllSet;
        this.promiseRaceSet = promiseRaceSet;
        this.lastSync = {};
        this.chainCounter = 0;
    }

    addNode (n) {
        this.nodes.push(n);
    }

    initNodesForHBConstruction () {
        let events = this.asyncObjs.getAll();
        this.events_num = events.length;
    }

    initNodes () {
        //let ids = this.asyncObjs.getAll().map(e => e.id).join(',');
        //console.log('initNodes: %s', ids);
        let events = this.asyncObjs.getAll()
            .filter(e => e.startOp)
            .sort(function (a, b) {
                return a.startOp.lineno - b.startOp.lineno;
            });
        //events.forEach(e => console.log(e.id));
        this.events_num = events.length;
        //console.log('initNodes: %s', events.map(e => e.id).join(','));
        let i = 0, j = 0;
        let tasks = [];
        while (i < events.length && j < this.actions.length) {
            if (events[i].startOp.lineno < this.actions[j].lineno) {tasks.push(events[i++])}
            else {tasks.push(this.actions[j++]);}
        }
        if (i == events.length) for (; j < this.actions.length; j++) {tasks.push(actions[j]);}
        else for (; i < events.length; i++) { tasks.push(events[i]); }

        //promise may have no startOp but it resolves others. So we take
        //these promises into consideration
        let promises = this.asyncObjs.getAll()
                        .filter(p => p.resolved && !p.startOp)
                        .sort(function (a, b) {
                            return a.resolved.lineno - b.resolved.lineno;
                        });
        this.events_num += promises.length;
        i = 0, j = 0;
        let _tasks = [];
        while (i < tasks.length && j < promises.length) {
            if (tasks[i].startOp && tasks[i].startOp.lineno < promises[j].resolved.lineno) {_tasks.push(tasks[i++]);}
            else if (tasks[i].resource && tasks[i].lineno < promises[j].resolved.lineno) {_tasks.push(tasks[i++]);}
            else {_tasks.push(promises[j++]);}
        }
        if (i == tasks.length) for (; j < promises.length; j++) {_tasks.push(promises[j]);}
        else for (; i < tasks.length; i++) { _tasks.push(tasks[i]); }

        /*_tasks.forEach(t => {
            let info;
            if (t.resource) info = t.lineno;
            else if (t.resolved) info = t.resolved.lineno;
            else info = t.startOp.lineno;
            console.log('%s: %s', t.id, info);
        });*/
        this.nodes = _tasks.map(t => t.id);
        //this.nodes.forEach(n => console.log(n));
    }

    add (fore, later, type) {
        if (fore == '51' && later == '55')
            console.log('debug');
        this.hb.push({fore, later, type});
    }

    has (fore, later) {
        let t = this.hb.find(r => r.fore == fore && r.later == later);
        return t ? true : false;
    }

    hasNode (node) {
        let t = this.nodes.find(n => n == node);
        return t? true : false;
    }

    removeIncomingTo (id) {
        _.remove(this.hb, (r) => {return r.later ==id && r.type =='resolve';});
    }


    remove(fore, later) {
        _.remove(this.hb, (r) => {return r.fore == fore && r.later == later});
    }

    addChain (chain) {
        this.chains[this.chainCounter] = chain;
        this.lastSync[this.chainCounter] = {};
        this.sync[this.chainCounter] = {};
        this.chainCounter++;
    }

    /** Get the synchronization that otherCid before cid */
    getLastSync (otherCid, cid) {
        if (!this.lastSync[cid]) return null;
        let res = this.lastSync[cid][otherCid] ? this.lastSync[cid][otherCid] : null;
        return res;
    }

    getSync (otherCid, cid) {
        if (!this.sync[cid]) return null;
        let res = this.sync[cid][otherCid] ? this.sync[cid][otherCid] : null;
        return res;
    }

    updateLastSync (fore, later) {
        let otherChainId = this.getChainId(fore);
        let currentChainId = this.getChainId(later);
        if (otherChainId != currentChainId) {
            let outdateSync = this.getLastSync(otherChainId, currentChainId);
            if (!outdateSync) {
                //two chains have never synchronized before
                this.lastSync[currentChainId][otherChainId] = { fore: fore, later: later }; 
            } else {
                //let outdateSync = this.lastSync[currentChainId][otherChainId];
                let outdateForeIdx = this.chains[otherChainId].indexOf(outdateSync.fore);
                let foreIdx = this.chains[otherChainId].indexOf(fore);
                if (outdateForeIdx < foreIdx) {
                    outdateSync.fore = fore;
                    if (outdateSync.later == later) this.remove(outdateSync.fore, later);
                    outdateSync.later = later
                } else if (outdateForeIdx > foreIdx) {
                    outdateSync.later = later;
                }
            }
            this.sync[currentChainId][otherChainId] = this.sync[currentChainId][otherChainId] ? this.sync[currentChainId][otherChainId] : [];
            this.sync[currentChainId][otherChainId].push({ fore: fore, later: later });
        }
    }

    reduceChain (fore, eid) {
        return;
        let cid = this.getChainId(eid)
        let chain = this.chains[cid];
        let otherChainCid = this.getChainId(fore);
        let otherChain = this.chains[otherChainCid];
        //requirement-1: length is 1
        if (chain.length == 1) {
            //requirement-2: fore node is leaf node
            if (otherChain.indexOf(fore) == otherChain.length - 1) {
                //case-1: 短并入长
                for (let i = 0; i < otherChain.length - 1; i++) {
                    //requirement-3: existence of other node before `fore`
                    let cond = this.hb.find(r => r.fore == otherChain[i] && r.later == eid);
                    if (cond) {
                        let deleteFore = cond.fore;
                        this.remove(deleteFore, eid);
                        //delete chain
                        otherChain.push(eid);
                        for (let key in this.lastSync[cid]) {
                            if (key == otherChainCid) continue;
                            if (otherChain.indexOf(this.lastSync[cid][key].fore) == -1)
                                this.updateLastSync(this.lastSync[cid][key].fore, eid);
                        }
                        delete this.chains[cid];
                        delete this.lastSync[cid];
                        break;
                    }
                }
            }
            //case-2:同短合并
            if (otherChain.length == 1) {
                otherChain.push(eid);
                for (let key in this.lastSync[cid]) {
                    if (key == otherChainCid) continue;
                    if (otherChain.indexOf(this.lastSync[cid][key].fore) == -1) {
                        let cond = this.hb.find(r => r.fore == this.lastSync[cid][key].fore && r.later == fore);
                        if (cond) this.remove(this.lastSync[cid][key].fore, eid);
                        this.updateLastSync(this.lastSync[cid][key].fore, eid);   
                    }
                }
                delete this.chains[cid];
                delete this.lastSync[cid];
            }
        }
    }

    removeFromPromiseRaceSet (id) {
        //let flag = false;
        for (var i = 0; i < this.promiseRaceSet.length; i++) {
            let cur = this.promiseRaceSet[i];
            let index = cur.indexOf(id);
            if (index != -1) {
                cur.splice(index, 1);
                this.promiseRaceSet[i] = cur;
                return;
            }
        }
    }

    /*happensBefore (ea, eb) {
        if (ea == eb)
            return false;
        else 
            return this.isReachable(ea, eb);
    }*/

    getIdxInExecution (eid) {
        return this.nodes.indexOf(eid);
    }

    isInSubGraph (idx, eid) {
        return this.getIdxInExecution(eid) <= idx;
    }

    happensBefore (aoi, aoj) {
        //if (aoi == '52' && aoj == '6')
        //console.log('new visite: %s, %s', aoi, aoj);
        //check hb relation among chains

        this.hb_call++;

        let result = false;

        if (this.isUsedMatrix) {
            result = this.matrix.get(aoi, aoj);
            if (result == 1) return true;
            else if (result == -1) return false;
        }

        let icid = this.getChainId(aoi);
        let jcid = this.getChainId(aoj);
        let ichain = this.chains[icid];
        let jchain = this.chains[jcid];
        if (icid == jcid && ichain && jchain) {
            result = ichain.indexOf(aoi) < jchain.indexOf(aoj);
            if (result && this.isUsedMatrix) this.matrix.update(aoi, aoj, 1);
            return result;
        }
        let directSync = this.getLastSync(icid, jcid);
        if (directSync && ichain && jchain) {
            result = ichain.indexOf(aoi) <= ichain.indexOf(directSync.fore) && jchain.indexOf(directSync.later) <= jchain.indexOf(aoj);
            if (result && this.isUsedMatrix) this.matrix.update(aoi, aoj, 1);
            return result;
        }

        //check by sync
        let syncs = this.getSync(icid, jcid);
        //console.log('hb: %s', JSON.stringify(syncs));
        if (syncs)
            for (let sync of syncs) {
                if (ichain && jchain && ichain.indexOf(aoi) <= ichain.indexOf(sync.fore) && jchain.indexOf(sync.later) <= jchain.indexOf(aoj)) {
                    if (this.isUsedMatrix) this.matrix.update(aoi, aoj, 1);
                    return true;   
                }
            }

        let jidx = this.getIdxInExecution(aoj);
        let visited = {};
        let rels = this.hb.filter(r => r.fore === aoi && this.isInSubGraph(jidx, r.later) && this.matrix.get(r.later, aoj) != -1);
        //let rels = this.hb.filter(r => r.fore === aoi);
        this.iteration++;
        while (rels.length > 0) {
            this.hb_check++;
            let relation = rels.pop();
            if (!visited[relation.later]) {
                visited[relation.later] = true;

                let ind = this.matrix.get(relation.later, aoj);
                if (ind == 1) {
                    this.matrix.update(aoi, aoj, 1);
                    return true;
                }

                if (relation.later === aoj) {
                    if (this.isUsedMatrix) this.matrix.update(aoi, aoj, 1);
                    return true;
                }
                else {

                    let ind_rels = this.hb.filter(r => r.fore === relation.later && this.isInSubGraph(jidx, r.later) && this.matrix.get(r.later, aoj) != -1);
                    //let ind_rels = this.hb.filter(r => r.fore === relation.later);
                    rels.push(...ind_rels);
                }
            }
        }
        return result;
    }

    isEventHB (e1, e2) {
        this.hb_call++;

        let result = false;

        result = this.matrix.get(e1, e2);
        if (result == 1) return true;
        else if (result == -1) return false;

        let cid1 = this.getChainId(e1);
        let cid2 = this.getChainId(e2);
        let chain1 = this.chains[cid1];
        let chain2 = this.chains[cid2];

        //on the same chain
        if (cid1 == cid2) {
            result = chain1.indexOf(e1) < chain2.indexOf(e2);
            if (result) this.matrix.update(e1, e2, 1);
            return result;
        }

        let directSync = this.getLastSync(cid1, cid2);
        if (directSync) {
            let result = chain1.indexOf(e1) <= chain1.indexOf(directSync.fore) && chain2.indexOf(directSync.later) <= chain2.indexOf(e2);
            if (result) this.matrix.update(e1, e2, 1);
            return result;
        }

        //check by sync
        let syncs = this.getSync(cid1, cid2);
        //console.log('hb: %s', JSON.stringify(syncs));
        if (syncs)
            for (let sync of syncs) {
                if (chain1.indexOf(e1) <= e1.indexOf(sync.fore) && chain2.indexOf(sync.later) <= chain2.indexOf(e2)) {
                    this.matrix.update(e1, e2, 1);
                    return true;   
                }
            }
        
        if (cid1 && cid2) {
            let visited = {};
            let idx = this.getIdxInExecution(e2);
            let inter_chain_nodes = this.hb.filter(r => r.fore == e1 && chain1.indexOf(r.later) == -1 && this.isInSubGraph(idx, r.later) && parseInt(this.getChainId(r.later)) <= parseInt(cid2));
            let same_chain_nodes = this.hb.filter(r => r.fore == e1 && chain1.indexOf(r.later) > -1 && this.isInSubGraph(idx, r.later) && parseInt(this.getChainId(r.later)) <= parseInt(cid2));
            let rels = [...inter_chain_nodes, same_chain_nodes];
            this.iteration++;
            while(rels.length > 0) {
                this.hb_check++;
                let relation = rels.pop();
                if (!visited[relation.later]) {
                    visited[relation.later] = true;

                    cid1 = this.getChainId(relation.later);
                    chain1 = this.chains[cid1];

                    if (cid1 == cid2 && chain1.indexOf(relation.later) <= chain2.indexOf(e2)) {
                        this.matrix.update(e1, e2, 1);
                        return true;
                    }

                    let ind_inter_chain_rels = this.hb.filter(r => r.fore == relation.later && chain1.indexOf(r.later) == -1 && this.isInSubGraph(idx, r.later) && parseInt(this.getChainId(r.later)) <= parseInt(cid2));
                    rels.push(...ind_inter_chain_rels);
                    let ind_same_chain_rels = this.hb.filter(r => r.fore == relation.later && chain1.indexOf(r.later) > -1 && this.isInSubGraph(idx, r.later) && parseInt(this.getChainId(r.later)) <= parseInt(cid2));
                    rels.push(...ind_same_chain_rels);
                }
            }
        }
        return false;
    }

    _happensBefore (aoi, aoj) {
        //if (aoi == '52' && aoj == '6')
        //console.log('new visite: %s, %s', aoi, aoj);
        let visited = {};
        let rels = this.hb.filter(r => r.fore === aoi);
        while (rels.length > 0) {
            let relation = rels.pop();
            if (!visited[relation.later]) {
                visited[relation.later] = true;

                if (relation.later === aoj)
                    return true;
                else {
                    let ind_rels = this.hb.filter(r => r.fore === relation.later);
                    rels.push(...ind_rels);
                }
            }
        }
        return false;
    }

    /*isOpHB (opi, opj) {
        //console.log('isOpHB: %s, %s', JSON.stringify(opi),
        //JSON.stringify(opj));
        if (opi == undefined || opj == undefined) return false;
        if (opi.event === opj.event){
            return opi.lineno < opj.lineno;
        } else {
            let ei = this.asyncObjs.getByAsyncId(opi.event)[0],
                ej = this.asyncObjs.getByAsyncId(opj.event)[0];
            return this.happensBeforeWithGraphLib(opi.event, opj.event);
        }
    }

    isOpConcur (opi, opj) {
        return ( (opi.lineno < opj.lineno && !this.isOpHB(opi, opj)) || 
        (opi.lineno > opj.lineno && !this.isOpHB(opj, opi)) )
    }*/

    isReachable (ei, ej) {
        var visited = {};
        visited[ei] = true;
        return this.dfs (visited, ei, ej);
    }

    dfs(visited, ei, ej) {
        //console.log('enter dfs %s, %s', ei, ej);
        if (ei === ej) {
            return true;
        }

        for (var i = 0; i < this.hb.length; i++) {
            var relation = this.hb[i];
            if (relation.fore == ei) {
                var ek = relation.later;
                if (visited[ek] != true) {
                    visited[ek] = true;
                    if (this.dfs(visited, ek, ej)) {
                        return true;
                    }
                    visited[ek] = false;
                }
            }
        }
        return false;
    }


    /*registeredInSameTick(aid, bid) {
        let pa = this.hb.find(h => h.later == aid && h.type == 'registration');
        let pb = this.hb.find(h => h.later == bid && h.type == 'registration');
        if (!pa || !pb)
            return false;

        return pa.fore == pb.fore;
    }*/

    registeredIn (latId) {
        let r = this.hb.find(r => r.later == latId && r.type == 'registration');
        if (r)
            return r.fore;
        return null;
    }

    resolvedIn (latId) {
        let r = this.hb.find(r => r.later == latId && r.type == 'resolve');
        if (r)
            return r.fore;
        return null;
    }

    /**
     * Given id of event, return the events that prior to the event,
     * according to the registration relation
     * @param {String} id 
     * @returns {Array} the list of events that happens before the
     * given event, according to registration relation, in the reverse
     * order (from near to far), including the event itself and `1`
     */
    getAllAncestor (id) {
        let res = [];

        let event = this.asyncObjs.getByAsyncId(id)[0];
        while (event) {
            res.push(event.id);
            event = event.prior;
        }
        return res;
    }

    getAllAncestorForAllEvents () {
        let res = {};
        let me = this;
        let events = this.asyncObjs.getAll();
        for (let event of events) {
            if (event.id == "1") continue;
            res[event.id] = me.getAllAncestor(event.id);
        }
        return res;
    }

    /**
     * Given id of event, return the events that after the event,
     * according to registration relation
     * @param {String} id 
     * @returns {Array} return the array of events that after the
     * event, in the order from near to far
     */
    getAllOffspring (id) {
        let res = [];
        let visited = {};
        let rels = this.hb.filter(r => r.fore === id && r.type === 'ASYNC_INIT');
        while (rels.length > 0) {
            let relation = rels.pop();
            if (!visited[relation.later]) {
                visited = true;
                
                let ind_rels = this.hb.filter(r => r.fore === relation.later && r.type === 'ASYNC_INIT');
                rels.push(...ind_rels);
            }
        }
        res = Object.keys(visited);
        return res;
    }

    getChainId (eid) {
        let result = null;
        for (let chainId in this.chains) {
            let chain = this.chains[chainId];
            if (chain.indexOf(eid) > -1) {
                result = chainId;
                break;
            }
        }
        return result;
    } 

    getRegistrationPath (aoi, aoj) {
        //console.log("getRegistrationPath: %s, %s", aoi, aoj);
        let events = this.asyncObjs.getAll();
        let e = events.find(e => e.id == aoj);
        //aoj = this.asyncObjs.getByAsyncId(aoj)[0];
        let res = [];
        let found = false;
        while (e) {
            res.push(e.id);
            e = events.find(event => event.id === e.prior);
            if (!e) break;
            if (e.id == aoi) {
                found = true;
                break;
            }
        }
        if (found) res.push(aoi);
        else res = [aoj];
        return res.reverse();
    }

    startGraphLibDataStructure() {
        let graph = new Graph();
        this.nodes.forEach(n => graph.setNode(n))
        //nodes.forEach(n => graph.setNode(n.id));
        this.hb.forEach(r => graph.setEdge(r.fore, r.later));
        this.graph = dijkstraAll(graph);
    }

    computePath (source) {
        return this.graph[source];
    }

    getPath (source, dist) {
        //ensure that there is a path from source to dist
        let paths = this.computePath(source);
        if (paths[dist].distance > 0 && paths[dist].distance != Number.POSITIVE_INFINITY) {
            let ret = [];
            let next = dist;
            while (next != source) {
                ret.push(next);
                next = paths[next].predecessor;
            }
            //return the path from source to dist (including source
            //and dist)
            ret.push(source);
            return ret.reverse();
        } else {
            return null;
        }
    }

    basicHappensBefore(aoi, aoj) {
        let visited = {};
        let rels = this.hb.filter(r => r.fore === aoi);
        while (rels.length > 0) {
            let relation = rels.pop();
            if (!visited[relation.later]) {
                visited[relation.later] = true;

                if (relation.later === aoj)
                    return true;
                else {
                    let ind_rels = this.hb.filter(r => r.fore === relation.later);
                    rels.push(...ind_rels);
                }
            }
        }
        return false;
    }

}

module.exports = Relations;