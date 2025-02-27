(function(){
    const async_hooks = require('async_hooks');
    const util = require('util');
    
    //TODO remove
    function debug(...args) {
        //use a function like this one when debugging inside an AsyncHooks callback
        fs.writeSync(1, `${util.format(...args)}\n`);
    }

    function AsyncMonitor(idManager, tracer){
        this.idManager = idManager;
        this.tracer = tracer;
        this.init();
    }
    AsyncMonitor.prototype.init = function(){
        var self = this;
        self.tracer.setExecutionAsyncId(1);

        async_hooks.createHook({
            init(asyncId, type, triggerAsyncId) {
                //debug(type,'('+asyncId+')','trigger:'+triggerAsyncId);
                self.tracer.logAsyncInit(asyncId,type, triggerAsyncId);
                //xiaoning
                //console.debug(asyncId, type, triggerAsyncId);
                //fs.writeSync(1, '*******register:'+String(asyncId)+','+type+','+String(triggerAsyncId)+'\n');
            },
            before(asyncId) {
                //debug('before:'+asyncId);
                self.tracer.logAsyncBefore(asyncId);
                self.tracer.setExecutionAsyncId(async_hooks.executionAsyncId());
            },
            after(asyncId) {
                //debug('after:'+asyncId);
                self.tracer.logAsyncAfter(asyncId);
            },
            destroy(asyncId) {
                //debug('destroy:'+asyncId);
                self.tracer.logAsyncDestroy(asyncId);
            },
            promiseResolve(asyncId){
                self.tracer.logAsyncPromiseResolve(asyncId, async_hooks.executionAsyncId());
            }
        }).enable();
    }
    ___TraceCollector___.AsyncMonitor = AsyncMonitor;
})(___TraceCollector___ || (___TraceCollector___ = {}));