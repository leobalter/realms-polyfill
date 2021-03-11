window.Realm = class {
    constructor() {
        const iframe = this.#iframe;
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        iframe.style.display = 'none';

        document.body.appendChild(iframe);
        
        const { contentWindow } = iframe;
        this.#globalThis = contentWindow.globalThis;
        this.#Function = contentWindow.Function;
        this.#AsyncFunction = contentWindow.AsyncFunction;
        this.#eval = contentWindow.eval;

        this.#fakeIntrinsic;
    }

    #eval;
    #globalThis;
    #Function;
    #AsyncFunction;
    #iframe = document.createElement('iframe');

    // This simulates the `%Realm%` preserved value
    #fakeIntrinsic = this.constructor;

    #isPrimitive(value) {
        return value === null || (typeof value !== 'function' && typeof value !== 'object');
    }

    eval(str) {
        var res = this.#errorCatcher(() => this.#eval(str));

        if (!this.#isPrimitive(res)) {
            throw new TypeError('Evaluation result is not a primitive value');
        }

        return res;
    }

    #errorCatcher(fn) {
        try {
            return fn();
        } catch(err) {
            if (err && typeof err === 'object') {
                throw new TypeError(`Cross-Realm Error: ${err.name}: ${err.message}`)
            } // Else
            throw new TypeError(`Cross-Realm Error: ${String(err)}`);
        }
    }

    // TODO: use a full toPrimitive helper
    #getPrimitives(args, skipWrappers) {
        return args.map(arg => {
            if (this.#isPrimitive(arg)) {
                return arg;
            } else if (skipWrappers && arg && arg[this.#fakeIntrinsic.#WRAPPER]) {
                // Skip if arg is a wrapped function
                return arg;
            } else if (arg[Symbol.toPrimitive]) {
                return arg[Symbol.toPrimitive]();
            } else {
                return String(arg);
            }
        });
    }

    get Function() {
        const errorCatcher = this.#errorCatcher;
        const redFunction = this.#Function;
        const getPrimitives = this.#getPrimitives.bind(this);
        const isPrimitive = this.#isPrimitive;
        const wrapperSymbol = this.#fakeIntrinsic.#WRAPPER;

        const make = fn => (...args) => {
            const primArgs = getPrimitives(args, true).map(arg => {
                if (typeof arg === 'function' && arg[wrapperSymbol]) {
                    return arg[wrapperSymbol];
                } else {
                    return arg;
                }
            });

            const res = errorCatcher(() => fn(...primArgs));

            if (!isPrimitive(res)) {
                throw new TypeError('Cross-Realm Error: function is not a primitive value');
            }

            return res;
        };
        return function Function(...args) {
            let fn;
            const newTarget = new.target;
            const primArgs = getPrimitives(args);

            if (newTarget) {
                errorCatcher(() => fn = Reflect.construct(redFunction, primArgs, newTarget));
            } else {
                errorCatcher(() => fn = redFunction(...primArgs));
            }

            return make(fn);
        };
    }
    AsyncFunction(...args) {}

    wrapperCallbackFunction(callback) {
        const res = (...args) => callback(...args);

        const wrapper = new this.#globalThis.Function('cb', 'function wrapper(...args) { return cb(...args); } return wrapper;');

        // TODO: set internal
        Object.defineProperty(res, this.#fakeIntrinsic.#WRAPPER, {
            value: wrapper(res)
        });
        
        return res;
    }

    static #WRAPPER = Symbol();
}
