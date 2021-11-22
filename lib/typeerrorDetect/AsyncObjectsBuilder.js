const AsyncObjects = require('./AsyncObjects');
const logger = require('../../driver/logger.js').logger;

class AsyncObjectsBuilder {
    constructor() {
        this.objects = [];
        this.eventExecutionStack = [];
        //Deal with Promise.all
        this.promiseAllSet = [];
        this.curr = null;
        //Deal with Promise.race
        this.promiseRaceSet = [];
        this.raceCurr = null;
        //use the source location of the first record during the
        //execution of a callback as the location of the callback
        this.eLoc = {};
        this.functionCallsMap = new Map();
        this.init();
        //we want to record event execution order
        this.execution = [];
    }

    //Add the event representing the global event
    init () {
        this.objects.push({
            id: '1',
            startOp: {
                event: '1',
                lineno: 1, //TODO: proper?
            }
        });
        this.eventExecutionStack.push('1');
    }

    push(e) {
        this.objects.push(e);
        if (this.curr != null) {
            this.findPromiseAll(e);
        }
        if (this.raceCurr != null) {
            this.findPromiseRace(e);
        }
    }

    getCurrentEvent() {
        return this.eventExecutionStack[this.eventExecutionStack.length -1];
    }

    enter(id, lineno) {
        //console.log('enter %s, lineno: %s', id, lineno);
        //console.log('In enter, objects: %s', JSON.stringify(this.objects));
        var inits = this.objects.filter(e => {return e.id == id;});
        //console.log('id: %s, inits: %s', id, JSON.stringify(inits));
        if (inits.length !== 0) {
            var init = inits[0];
            init.executionTimes++;
            //For timer registered by setIntervel, it can be executed
            //multiple times. In order to build hb relation later,
            //insert multiple event objects.
            if (init.executionTimes > 1) {
                this.push({
                   id: id + '-' + init.executionTimes,
                   prior: init.prior,
                   type: init.type,
                   delayTime: init.delayTime,
                   lineno: lineno,
                   entryType: 'START_INSERT',
                   registerOp: init.registerOp,
                   executionTimes: 1,
                   startOp: {
                       event: id + '-' + init.executionTimes,
                       lineno: lineno,
                   },
                });
                this.eventExecutionStack.push(id + '-' + init.executionTimes);
            } else {
                this.eventExecutionStack.push(id);
            }
        }
        else {
            this.eventExecutionStack.push(id);
        }
        //record event execution order
        let current = this.getCurrentEvent();
        this.execution.push(current);
        //console.log(this.execution.join('->'));
    }

    resolve (id, current, trigger, lineno) {
        //And the a fake start operation in order to accompanied with
        //isEventHB
        //Avoid a special case: a promise can be resolved during its
        //execution. So, it can already have startOp
        let e = this.objects.filter(event => event.id === id);
        //Avoid trigger event (trigger) == 0
        if (e.length == 0) return;
        if (!e[0].hasOwnProperty('startOp'))
            this.startExecution(id, lineno);
        var inits = this.objects.filter(e => {return e.id == id;});
        if (inits.length != 0) {
            inits[0].resolved = {
                current: current,
                trigger: trigger,
                lineno: lineno,
            }
        }
    }

    exit(id) {
        this.eventExecutionStack.pop();
    } 

    toString() {
        return JSON.stringify(this.objects);
    }

    extract() {
        return new AsyncObjects(this.objects);
    }

    getPromiseAllSet() {
        return this.promiseAllSet;
    }

    getPromiseRaceSet () {
        return this.promiseRaceSet;
    }

    startExecution(id, lineno) {
        var cur = this.getCurrentEvent();
        if (cur != id) id = cur;
        var res = this.objects.filter(event => event.id === id);
        if (!res) {
            logger.error('Event %s is not registered before', id);
            return;
        }
        // Some system events may start to execute without registration
        if (res.length === 0) {
            return;
        }
        res[0].startOp = {
            event: id,
            lineno: lineno,
        };
    }

    getAll () {
        return this.objects;
    }

    promiseAllBegin () {
        this.curr = [];

    }

    promiseAllEnd () {
        this.promiseAllSet.push(this.curr);
        this.curr = null;
    }

    findPromiseAll (e) {
        if (e.entryType == 'ASYNC_INIT' && e.type == 'PROMISE') {
            this.curr.push(e.id);
        }
    }

    promiseRaceBegin () {
        this.raceCurr = [];
    }

    promiseRaceEnd () {
        this.promiseRaceSet.push(this.raceCurr);
        this.raceCurr = null;
    }

    findPromiseRace (e) {
        if (e.entryType == 'ASYNC_INIT' && e.type == 'PROMISE') {
            this.raceCurr.push(e.id);
        }
    }

    setELoc (rcd) {
        if (!this.eLoc.hasOwnProperty(rcd.event)) {
            this.eLoc[rcd.event] = rcd.location;
        }
    }

    getELocs () {
        return this.eLoc;
    }

    ready () {
        this.objects.forEach(e => {
            e.loc = this.eLoc[e.id];
        });
    }

    findAssociatedAsyncObject (targetId, lineno) {
        let ret = this.objects.filter(e => e.id == targetId || targetId == e.id.split('-')[0]);
        for (let i = 0; i < ret.length - 1; i++) {
            if (ret[i].startOp.lineno < lineno && lineno < ret[i + 1].startOp.lineno){
                return ret[i];
            }
        }
        return ret[ret.length - 1];
    }

    associateCallbacks (fname, targetId, lineno, location) {
        let e = this.findAssociatedAsyncObject(targetId, lineno);
        if (!e.callback) {
            e.callback = {
                name: fname,
                location: location,
                lineno: lineno,
            }
        }
    }

    addIndexes(entries) {   // eslint-disable-line no-unused-vars
        let index = 0;
        entries = entries.map((e) => {
            e.logindex = index++;
            return e;
        });
    }

    dealWithMainModule(entries) {
        let self = this;
        let mainentry = {
            id: 1,
            entry: {
                e: 'AsyncHook-init',
                id: 1,
                trigger: 0,
                type: 'main',
                current: 0
            }
        };

        let maincall = entries.find((entry) => entry.current === 1 && entry.e === 'call-entry');
        if (maincall)
            mainentry.callback = {
                name: maincall.function,
                file: maincall.file,
                line: maincall.line,
                args: maincall.args,
                logindex: maincall.logindex,
                instance: this.calculateInstanceOrder(maincall)
            };

        self.objects.push(mainentry);
    }

    calculateInstanceOrder(entry) {
        let funcInst = this.functionCallsMap.get(entry.function + '#' + entry.file + '#' + entry.line);
        if (!funcInst)
            funcInst = 0;
        this.functionCallsMap.set(entry.function + '#' + entry.file + '#' + entry.line, ++funcInst);

        return funcInst;
    }

}

module.exports = AsyncObjectsBuilder