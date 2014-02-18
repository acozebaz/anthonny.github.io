/*!
 angular-asciidoc-directive - v0.0.1 - 2014-02-18 

======================================= 
opal version : 0.5.5 
opal-sprockets version : 0.3.0 
asciidoctor version : 1.5.0.preview.1 
*/

(function(undefined) {
  // The Opal object that is exposed globally
  var Opal = this.Opal = {};

  // The actual class for BasicObject
  var RubyBasicObject;

  // The actual Object class
  var RubyObject;

  // The actual Module class
  var RubyModule;

  // The actual Class class
  var RubyClass;

  // Constructor for instances of BasicObject
  function BasicObject(){}

  // Constructor for instances of Object
  function Object(){}

  // Constructor for instances of Class
  function Class(){}

  // Constructor for instances of Module
  function Module(){}

  // Constructor for instances of NilClass (nil)
  function NilClass(){}

  // All bridged classes - keep track to donate methods from Object
  var bridged_classes = [];

  // TopScope is used for inheriting constants from the top scope
  var TopScope = function(){};

  // Opal just acts as the top scope
  TopScope.prototype = Opal;

  // To inherit scopes
  Opal.constructor  = TopScope;

  Opal.constants = [];

  // This is a useful reference to global object inside ruby files
  Opal.global = this;

  // Minify common function calls
  var $hasOwn = Opal.hasOwnProperty;
  var $slice  = Opal.slice = Array.prototype.slice;

  // Generates unique id for every ruby object
  var unique_id = 0;

  // Return next unique id
  Opal.uid = function() {
    return unique_id++;
  };

  // Table holds all class variables
  Opal.cvars = {};

  // Globals table
  Opal.gvars = {};

  /*
   * Create a new constants scope for the given class with the given
   * base. Constants are looked up through their parents, so the base
   * scope will be the outer scope of the new klass.
   */
  function create_scope(base, klass, id) {
    var const_alloc   = function() {};
    var const_scope   = const_alloc.prototype = new base.constructor();
    klass._scope      = const_scope;
    const_scope.base  = klass;
    klass._base_module = base.base;
    const_scope.constructor = const_alloc;
    const_scope.constants = [];

    if (id) {
      klass._orig_scope = base;
      base[id] = base.constructor[id] = klass;
      base.constants.push(id);
    }
  }

  Opal.create_scope = create_scope;

  /*
   * A `class Foo; end` expression in ruby is compiled to call this runtime
   * method which either returns an existing class of the given name, or creates
   * a new class in the given `base` scope.
   *
   * If a constant with the given name exists, then we check to make sure that
   * it is a class and also that the superclasses match. If either of these
   * fail, then we raise a `TypeError`. Note, superklass may be null if one was
   * not specified in the ruby code.
   *
   * We pass a constructor to this method of the form `function ClassName() {}`
   * simply so that classes show up with nicely formatted names inside debuggers
   * in the web browser (or node/sprockets).
   *
   * The `base` is the current `self` value where the class is being created
   * from. We use this to get the scope for where the class should be created.
   * If `base` is an object (not a class/module), we simple get its class and
   * use that as the base instead.
   *
   * @param [Object] base where the class is being created
   * @param [Class] superklass superclass of the new class (may be null)
   * @param [String] id the name of the class to be created
   * @param [Function] constructor function to use as constructor
   * @return [Class] new or existing ruby class
   */
  Opal.klass = function(base, superklass, id, constructor) {

    // If base is an object, use its class
    if (!base._isClass) {
      base = base._klass;
    }

    // Not specifying a superclass means we can assume it to be Object
    if (superklass === null) {
      superklass = RubyObject;
    }

    var klass = base._scope[id];

    // If a constant exists in the scope, then we must use that
    if ($hasOwn.call(base._scope, id) && klass._orig_scope === base._scope) {

      // Make sure the existing constant is a class, or raise error
      if (!klass._isClass) {
        throw Opal.TypeError.$new(id + " is not a class");
      }

      // Make sure existing class has same superclass
      if (superklass !== klass._super && superklass !== RubyObject) {
        throw Opal.TypeError.$new("superclass mismatch for class " + id);
      }
    }
    else if (typeof(superklass) === 'function') {
      // passed native constructor as superklass, so bridge it as ruby class
      return bridge_class(id, superklass);
    }
    else {
      // if class doesnt exist, create a new one with given superclass
      klass = boot_class(superklass, constructor);

      // name class using base (e.g. Foo or Foo::Baz)
      klass._name = id;

      // every class gets its own constant scope, inherited from current scope
      create_scope(base._scope, klass, id);

      // Name new class directly onto current scope (Opal.Foo.Baz = klass)
      base[id] = base._scope[id] = klass;

      // Copy all parent constants to child, unless parent is Object
      if (superklass !== RubyObject && superklass !== RubyBasicObject) {
        Opal.donate_constants(superklass, klass);
      }

      // call .inherited() hook with new class on the superclass
      if (superklass.$inherited) {
        superklass.$inherited(klass);
      }
    }

    return klass;
  };

  // Create generic class with given superclass.
  var boot_class = Opal.boot = function(superklass, constructor) {
    // instances
    var ctor = function() {};
        ctor.prototype = superklass._proto;

    constructor.prototype = new ctor();

    constructor.prototype.constructor = constructor;

    return boot_class_meta(superklass, constructor);
  };

  // class itself
  function boot_class_meta(superklass, constructor) {
    var mtor = function() {};
    mtor.prototype = superklass.constructor.prototype;

    function OpalClass() {};
    OpalClass.prototype = new mtor();

    var klass = new OpalClass();

    klass._id         = unique_id++;
    klass._alloc      = constructor;
    klass._isClass    = true;
    klass.constructor = OpalClass;
    klass._super      = superklass;
    klass._methods    = [];
    klass.__inc__     = [];
    klass.__parent    = superklass;
    klass._proto      = constructor.prototype;

    constructor.prototype._klass = klass;

    return klass;
  }

  // Define new module (or return existing module)
  Opal.module = function(base, id) {
    var module;

    if (!base._isClass) {
      base = base._klass;
    }

    if ($hasOwn.call(base._scope, id)) {
      module = base._scope[id];

      if (!module.__mod__ && module !== RubyObject) {
        throw Opal.TypeError.$new(id + " is not a module")
      }
    }
    else {
      module = boot_module()
      module._name = id;

      create_scope(base._scope, module, id);

      // Name new module directly onto current scope (Opal.Foo.Baz = module)
      base[id] = base._scope[id] = module;
    }

    return module;
  };

  /*
   * Internal function to create a new module instance. This simply sets up
   * the prototype hierarchy and method tables.
   */
  function boot_module() {
    var mtor = function() {};
    mtor.prototype = RubyModule.constructor.prototype;

    function OpalModule() {};
    OpalModule.prototype = new mtor();

    var module = new OpalModule();

    module._id         = unique_id++;
    module._isClass    = true;
    module.constructor = OpalModule;
    module._super      = RubyModule;
    module._methods    = [];
    module.__inc__     = [];
    module.__parent    = RubyModule;
    module._proto      = {};
    module.__mod__     = true;
    module.__dep__     = [];

    return module;
  }

  // Boot a base class (makes instances).
  var boot_defclass = function(id, constructor, superklass) {
    if (superklass) {
      var ctor           = function() {};
          ctor.prototype = superklass.prototype;

      constructor.prototype = new ctor();
    }

    constructor.prototype.constructor = constructor;

    return constructor;
  };

  // Boot the actual (meta?) classes of core classes
  var boot_makemeta = function(id, constructor, superklass) {

    var mtor = function() {};
    mtor.prototype  = superklass.prototype;

    function OpalClass() {};
    OpalClass.prototype = new mtor();

    var klass = new OpalClass();

    klass._id         = unique_id++;
    klass._alloc      = constructor;
    klass._isClass    = true;
    klass._name       = id;
    klass._super      = superklass;
    klass.constructor = OpalClass;
    klass._methods    = [];
    klass.__inc__     = [];
    klass.__parent    = superklass;
    klass._proto      = constructor.prototype;

    constructor.prototype._klass = klass;

    Opal[id] = klass;
    Opal.constants.push(id);

    return klass;
  };

  /*
   * For performance, some core ruby classes are toll-free bridged to their
   * native javascript counterparts (e.g. a ruby Array is a javascript Array).
   *
   * This method is used to setup a native constructor (e.g. Array), to have
   * its prototype act like a normal ruby class. Firstly, a new ruby class is
   * created using the native constructor so that its prototype is set as the
   * target for th new class. Note: all bridged classes are set to inherit
   * from Object.
   *
   * Bridged classes are tracked in `bridged_classes` array so that methods
   * defined on Object can be "donated" to all bridged classes. This allows
   * us to fake the inheritance of a native prototype from our Object
   * prototype.
   *
   * Example:
   *
   *    bridge_class("Proc", Function);
   *
   * @param [String] name the name of the ruby class to create
   * @param [Function] constructor native javascript constructor to use
   * @return [Class] returns new ruby class
   */
  function bridge_class(name, constructor) {
    var klass = boot_class_meta(RubyObject, constructor);

    klass._name = name;

    create_scope(Opal, klass, name);
    bridged_classes.push(klass);

    var object_methods = RubyBasicObject._methods.concat(RubyObject._methods);

    for (var i = 0, len = object_methods.length; i < len; i++) {
      var meth = object_methods[i];
      constructor.prototype[meth] = RubyObject._proto[meth];
    }

    return klass;
  };

  /*
   * constant assign
   */
  Opal.casgn = function(base_module, name, value) {
    var scope = base_module._scope;

    if (value._isClass && value._name === nil) {
      value._name = name;
    }

    if (value._isClass) {
      value._base_module = base_module;
    }

    scope.constants.push(name);
    return scope[name] = value;
  };

  /*
   * constant decl
   */
  Opal.cdecl = function(base_scope, name, value) {
    base_scope.constants.push(name);
    return base_scope[name] = value;
  };

  /*
   * constant get
   */
  Opal.cget = function(base_scope, path) {
    if (path == null) {
      path       = base_scope;
      base_scope = Opal.Object;
    }

    var result = base_scope;

    path = path.split('::');
    while (path.length != 0) {
      result = result.$const_get(path.shift());
    }

    return result;
  }

  /*
   * When a source module is included into the target module, we must also copy
   * its constants to the target.
   */
  Opal.donate_constants = function(source_mod, target_mod) {
    var source_constants = source_mod._scope.constants,
        target_scope     = target_mod._scope,
        target_constants = target_scope.constants;

    for (var i = 0, length = source_constants.length; i < length; i++) {
      target_constants.push(source_constants[i]);
      target_scope[source_constants[i]] = source_mod._scope[source_constants[i]];
    }
  };

  /*
   * Methods stubs are used to facilitate method_missing in opal. A stub is a
   * placeholder function which just calls `method_missing` on the receiver.
   * If no method with the given name is actually defined on an object, then it
   * is obvious to say that the stub will be called instead, and then in turn
   * method_missing will be called.
   *
   * When a file in ruby gets compiled to javascript, it includes a call to
   * this function which adds stubs for every method name in the compiled file.
   * It should then be safe to assume that method_missing will work for any
   * method call detected.
   *
   * Method stubs are added to the BasicObject prototype, which every other
   * ruby object inherits, so all objects should handle method missing. A stub
   * is only added if the given property name (method name) is not already
   * defined.
   *
   * Note: all ruby methods have a `$` prefix in javascript, so all stubs will
   * have this prefix as well (to make this method more performant).
   *
   *    Opal.add_stubs(["$foo", "$bar", "$baz="]);
   *
   * All stub functions will have a private `rb_stub` property set to true so
   * that other internal methods can detect if a method is just a stub or not.
   * `Kernel#respond_to?` uses this property to detect a methods presence.
   *
   * @param [Array] stubs an array of method stubs to add
   */
  Opal.add_stubs = function(stubs) {
    for (var i = 0, length = stubs.length; i < length; i++) {
      var stub = stubs[i];

      if (!BasicObject.prototype[stub]) {
        BasicObject.prototype[stub] = true;
        add_stub_for(BasicObject.prototype, stub);
      }
    }
  };

  /*
   * Actuall add a method_missing stub function to the given prototype for the
   * given name.
   *
   * @param [Prototype] prototype the target prototype
   * @param [String] stub stub name to add (e.g. "$foo")
   */
  function add_stub_for(prototype, stub) {
    function method_missing_stub() {
      // Copy any given block onto the method_missing dispatcher
      this.$method_missing._p = method_missing_stub._p;

      // Set block property to null ready for the next call (stop false-positives)
      method_missing_stub._p = null;

      // call method missing with correct args (remove '$' prefix on method name)
      return this.$method_missing.apply(this, [stub.slice(1)].concat($slice.call(arguments)));
    }

    method_missing_stub.rb_stub = true;
    prototype[stub] = method_missing_stub;
  }

  // Expose for other parts of Opal to use
  Opal.add_stub_for = add_stub_for;

  // Const missing dispatcher
  Opal.cm = function(name) {
    return this.base.$const_missing(name);
  };

  // Arity count error dispatcher
  Opal.ac = function(actual, expected, object, meth) {
    var inspect = (object._isClass ? object._name + '.' : object._klass._name + '#') + meth;
    var msg = '[' + inspect + '] wrong number of arguments(' + actual + ' for ' + expected + ')';
    throw Opal.ArgumentError.$new(msg);
  };

  // Super dispatcher
  Opal.find_super_dispatcher = function(obj, jsid, current_func, iter, defs) {
    var dispatcher;

    if (defs) {
      dispatcher = obj._isClass ? defs._super : obj._klass._proto;
    }
    else {
      if (obj._isClass) {
        dispatcher = obj._super;
      }
      else {
        dispatcher = find_obj_super_dispatcher(obj, jsid, current_func);
      }
    }

    dispatcher = dispatcher['$' + jsid];
    dispatcher._p = iter;

    return dispatcher;
  };

  // Iter dispatcher for super in a block
  Opal.find_iter_super_dispatcher = function(obj, jsid, current_func, iter, defs) {
    if (current_func._def) {
      return Opal.find_super_dispatcher(obj, current_func._jsid, current_func, iter, defs);
    }
    else {
      return Opal.find_super_dispatcher(obj, jsid, current_func, iter, defs);
    }
  };

  var find_obj_super_dispatcher = function(obj, jsid, current_func) {
    var klass = obj.__meta__ || obj._klass;

    while (klass) {
      if (klass._proto['$' + jsid] === current_func) {
        // ok
        break;
      }

      klass = klass.__parent;
    }

    // if we arent in a class, we couldnt find current?
    if (!klass) {
      throw new Error("could not find current class for super()");
    }

    klass = klass.__parent;

    // else, let's find the next one
    while (klass) {
      var working = klass._proto['$' + jsid];

      if (working && working !== current_func) {
        // ok
        break;
      }

      klass = klass.__parent;
    }

    return klass._proto;
  };

  /*
   * Used to return as an expression. Sometimes, we can't simply return from
   * a javascript function as if we were a method, as the return is used as
   * an expression, or even inside a block which must "return" to the outer
   * method. This helper simply throws an error which is then caught by the
   * method. This approach is expensive, so it is only used when absolutely
   * needed.
   */
  Opal.$return = function(val) {
    Opal.returner.$v = val;
    throw Opal.returner;
  };

  // handles yield calls for 1 yielded arg
  Opal.$yield1 = function(block, arg) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1) {
      if (arg._isArray) {
        return block.apply(null, arg);
      }
      else {
        return block(arg);
      }
    }
    else {
      return block(arg);
    }
  };

  // handles yield for > 1 yielded arg
  Opal.$yieldX = function(block, args) {
    if (typeof(block) !== "function") {
      throw Opal.LocalJumpError.$new("no block given");
    }

    if (block.length > 1 && args.length == 1) {
      if (args[0]._isArray) {
        return block.apply(null, args[0]);
      }
    }

    if (!args._isArray) {
      args = $slice.call(args);
    }

    return block.apply(null, args);
  };

  Opal.is_a = function(object, klass) {
    if (object.__meta__ === klass) {
      return true;
    }

    var search = object._klass;

    while (search) {
      if (search === klass) {
        return true;
      }

      search = search._super;
    }

    return false;
  }

  // Helper to convert the given object to an array
  Opal.to_ary = function(value) {
    if (value._isArray) {
      return value;
    }
    else if (value.$to_ary && !value.$to_ary.rb_stub) {
      return value.$to_ary();
    }

    return [value];
  };

  /*
    Call a ruby method on a ruby object with some arguments:

      var my_array = [1, 2, 3, 4]
      Opal.send(my_array, 'length')     # => 4
      Opal.send(my_array, 'reverse!')   # => [4, 3, 2, 1]

    A missing method will be forwarded to the object via
    method_missing.

    The result of either call with be returned.

    @param [Object] recv the ruby object
    @param [String] mid ruby method to call
  */
  Opal.send = function(recv, mid) {
    var args = $slice.call(arguments, 2),
        func = recv['$' + mid];

    if (func) {
      return func.apply(recv, args);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args));
  };

  Opal.block_send = function(recv, mid, block) {
    var args = $slice.call(arguments, 3),
        func = recv['$' + mid];

    if (func) {
      func._p = block;
      return func.apply(recv, args);
    }

    return recv.$method_missing.apply(recv, [mid].concat(args));
  };

  /**
   * Donate methods for a class/module
   */
  Opal.donate = function(klass, defined, indirect) {
    var methods = klass._methods, included_in = klass.__dep__;

    // if (!indirect) {
      klass._methods = methods.concat(defined);
    // }

    if (included_in) {
      for (var i = 0, length = included_in.length; i < length; i++) {
        var includee = included_in[i];
        var dest = includee._proto;

        for (var j = 0, jj = defined.length; j < jj; j++) {
          var method = defined[j];
          dest[method] = klass._proto[method];
          dest[method]._donated = true;
        }

        if (includee.__dep__) {
          Opal.donate(includee, defined, true);
        }
      }
    }
  };

  Opal.defn = function(obj, jsid, body) {
    if (obj.__mod__) {
      obj._proto[jsid] = body;
      Opal.donate(obj, [jsid]);
    }
    else if (obj._isClass) {
      obj._proto[jsid] = body;

      if (obj === RubyBasicObject) {
        define_basic_object_method(jsid, body);
      }
      else if (obj === RubyObject) {
        Opal.donate(obj, [jsid]);
      }
    }
    else {
      obj[jsid] = body;
    }

    return nil;
  };

  /*
   * Define a singleton method on the given object.
   */
  Opal.defs = function(obj, jsid, body) {
    if (obj._isClass || obj.__mod__) {
      obj.constructor.prototype[jsid] = body;
    }
    else {
      obj[jsid] = body;
    }
  };

  function define_basic_object_method(jsid, body) {
    RubyBasicObject._methods.push(jsid);
    for (var i = 0, len = bridged_classes.length; i < len; i++) {
      bridged_classes[i]._proto[jsid] = body;
    }
  }

  Opal.hash = function() {
    if (arguments.length == 1 && arguments[0]._klass == Opal.Hash) {
      return arguments[0];
    }

    var hash   = new Opal.Hash._alloc,
        keys   = [],
        assocs = {};

    hash.map   = assocs;
    hash.keys  = keys;

    if (arguments.length == 1 && arguments[0]._isArray) {
      var args = arguments[0];

      for (var i = 0, length = args.length; i < length; i++) {
        var key = args[i][0], obj = args[i][1];

        if (assocs[key] == null) {
          keys.push(key);
        }

        assocs[key] = obj;
      }
    }
    else {
      for (var i = 0, length = arguments.length; i < length; i++) {
        var key = arguments[i],
            obj = arguments[++i];

        if (assocs[key] == null) {
          keys.push(key);
        }

        assocs[key] = obj;
      }
    }

    return hash;
  };

  /*
   * hash2 is a faster creator for hashes that just use symbols and
   * strings as keys. The map and keys array can be constructed at
   * compile time, so they are just added here by the constructor
   * function
   */
  Opal.hash2 = function(keys, map) {
    var hash = new Opal.Hash._alloc;

    hash.keys = keys;
    hash.map  = map;

    return hash;
  };

  /*
   * Create a new range instance with first and last values, and whether the
   * range excludes the last value.
   */
  Opal.range = function(first, last, exc) {
    var range         = new Opal.Range._alloc;
        range.begin   = first;
        range.end     = last;
        range.exclude = exc;

    return range;
  };

  // Initialization
  // --------------

  // Constructors for *instances* of core objects
  boot_defclass('BasicObject', BasicObject);
  boot_defclass('Object', Object, BasicObject);
  boot_defclass('Module', Module, Object);
  boot_defclass('Class', Class, Module);

  // Constructors for *classes* of core objects
  RubyBasicObject = boot_makemeta('BasicObject', BasicObject, Class);
  RubyObject      = boot_makemeta('Object', Object, RubyBasicObject.constructor);
  RubyModule      = boot_makemeta('Module', Module, RubyObject.constructor);
  RubyClass       = boot_makemeta('Class', Class, RubyModule.constructor);

  // Fix booted classes to use their metaclass
  RubyBasicObject._klass = RubyClass;
  RubyObject._klass = RubyClass;
  RubyModule._klass = RubyClass;
  RubyClass._klass = RubyClass;

  // Fix superclasses of booted classes
  RubyBasicObject._super = null;
  RubyObject._super = RubyBasicObject;
  RubyModule._super = RubyObject;
  RubyClass._super = RubyModule;

  // Internally, Object acts like a module as it is "included" into bridged
  // classes. In other words, we donate methods from Object into our bridged
  // classes as their prototypes don't inherit from our root Object, so they
  // act like module includes.
  RubyObject.__dep__ = bridged_classes;

  Opal.base = RubyObject;
  RubyBasicObject._scope = RubyObject._scope = Opal;
  RubyBasicObject._orig_scope = RubyObject._orig_scope = Opal;
  Opal.Kernel = RubyObject;

  RubyModule._scope = RubyObject._scope;
  RubyClass._scope = RubyObject._scope;
  RubyModule._orig_scope = RubyObject._orig_scope;
  RubyClass._orig_scope = RubyObject._orig_scope;

  RubyObject._proto.toString = function() {
    return this.$to_s();
  };

  Opal.top = new RubyObject._alloc();

  Opal.klass(RubyObject, RubyObject, 'NilClass', NilClass);

  var nil = Opal.nil = new NilClass;
  nil.call = nil.apply = function() { throw Opal.LocalJumpError.$new('no block given'); };

  Opal.breaker  = new Error('unexpected break');
  Opal.returner = new Error('unexpected return');

  bridge_class('Array', Array);
  bridge_class('Boolean', Boolean);
  bridge_class('Numeric', Number);
  bridge_class('String', String);
  bridge_class('Proc', Function);
  bridge_class('Exception', Error);
  bridge_class('Regexp', RegExp);
  bridge_class('Time', Date);

  TypeError._super = Error;
}).call(this);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module;
  return (function($base) {
    var self = $module($base, 'Opal');

    var def = self._proto, $opalScope = self._scope;
    $opal.defs(self, '$coerce_to', function(object, type, method) {
      var $a, self = this;
      if (($a = type['$==='](object)) !== false && $a !== nil) {
        return object};
      if (($a = object['$respond_to?'](method)) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "no implicit conversion of " + (object.$class()) + " into " + (type))};
      return object.$__send__(method);
    });

    $opal.defs(self, '$coerce_to!', function(object, type, method) {
      var $a, self = this, coerced = nil;
      coerced = self.$coerce_to(object, type, method);
      if (($a = type['$==='](coerced)) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "can't convert " + (object.$class()) + " into " + (type) + " (" + (object.$class()) + "#" + (method) + " gives " + (coerced.$class()))};
      return coerced;
    });

    $opal.defs(self, '$try_convert', function(object, type, method) {
      var $a, self = this;
      if (($a = type['$==='](object)) !== false && $a !== nil) {
        return object};
      if (($a = object['$respond_to?'](method)) !== false && $a !== nil) {
        return object.$__send__(method)
        } else {
        return nil
      };
    });

    $opal.defs(self, '$compare', function(a, b) {
      var $a, self = this, compare = nil;
      compare = a['$<=>'](b);
      if (($a = compare === nil) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "comparison of " + (a.$class().$name()) + " with " + (b.$class().$name()) + " failed")};
      return compare;
    });

    $opal.defs(self, '$fits_fixnum!', function(value) {
      var $a, self = this;
      if (($a = value > 2147483648) !== false && $a !== nil) {
        return self.$raise($opalScope.RangeError, "bignum too big to convert into `long'")
        } else {
        return nil
      };
    });

    $opal.defs(self, '$fits_array!', function(value) {
      var $a, self = this;
      if (($a = value >= 536870910) !== false && $a !== nil) {
        return self.$raise($opalScope.ArgumentError, "argument too big")
        } else {
        return nil
      };
    });

    $opal.defs(self, '$destructure', function(args) {
      var self = this;
      
      if (args.length == 1) {
        return args[0];
      }
      else if (args._isArray) {
        return args;
      }
      else {
        return $slice.call(args);
      }
    
    });
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = $Module._proto, $opalScope = $Module._scope, TMP_1, TMP_2, TMP_3, TMP_4;
    $opal.defs(self, '$new', TMP_1 = function() {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      
      function AnonModule(){}
      var klass     = Opal.boot(Opal.Module, AnonModule);
      klass._name   = nil;
      klass._klass  = Opal.Module;
      klass.__dep__ = []
      klass.__mod__ = true;
      klass._proto  = {};

      // inherit scope from parent
      $opal.create_scope(Opal.Module._scope, klass);

      if (block !== nil) {
        var block_self = block._s;
        block._s = null;
        block.call(klass);
        block._s = block_self;
      }

      return klass;
    
    });

    def['$==='] = function(object) {
      var $a, self = this;
      if (($a = object == null) !== false && $a !== nil) {
        return false};
      return $opal.is_a(object, self);
    };

    def['$<'] = function(other) {
      var self = this;
      
      var working = self;

      while (working) {
        if (working === other) {
          return true;
        }

        working = working.__parent;
      }

      return false;
    
    };

    def.$alias_method = function(newname, oldname) {
      var self = this;
      
      self._proto['$' + newname] = self._proto['$' + oldname];

      if (self._methods) {
        $opal.donate(self, ['$' + newname ])
      }
    
      return self;
    };

    def.$alias_native = function(mid, jsid) {
      var self = this;
      if (jsid == null) {
        jsid = mid
      }
      return self._proto['$' + mid] = self._proto[jsid];
    };

    def.$ancestors = function() {
      var self = this;
      
      var parent = self,
          result = [];

      while (parent) {
        result.push(parent);
        result = result.concat(parent.__inc__);

        parent = parent._super;
      }

      return result;
    
    };

    def.$append_features = function(klass) {
      var self = this;
      
      var module   = self,
          included = klass.__inc__;

      // check if this module is already included in the klass
      for (var i = 0, length = included.length; i < length; i++) {
        if (included[i] === module) {
          return;
        }
      }

      included.push(module);
      module.__dep__.push(klass);

      // iclass
      var iclass = {
        name: module._name,

        _proto:   module._proto,
        __parent: klass.__parent,
        __iclass: true
      };

      klass.__parent = iclass;

      var donator   = module._proto,
          prototype = klass._proto,
          methods   = module._methods;

      for (var i = 0, length = methods.length; i < length; i++) {
        var method = methods[i];

        if (prototype.hasOwnProperty(method) && !prototype[method]._donated) {
          // if the target class already has a method of the same name defined
          // and that method was NOT donated, then it must be a method defined
          // by the class so we do not want to override it
        }
        else {
          prototype[method] = donator[method];
          prototype[method]._donated = true;
        }
      }

      if (klass.__dep__) {
        $opal.donate(klass, methods.slice(), true);
      }

      $opal.donate_constants(module, klass);
    
      return self;
    };

    def.$attr_accessor = function(names) {
      var $a, $b, self = this;
      names = $slice.call(arguments, 0);
      ($a = self).$attr_reader.apply($a, [].concat(names));
      return ($b = self).$attr_writer.apply($b, [].concat(names));
    };

    def.$attr_reader = function(names) {
      var self = this;
      names = $slice.call(arguments, 0);
      
      var proto = self._proto, cls = self;
      for (var i = 0, length = names.length; i < length; i++) {
        (function(name) {
          proto[name] = nil;
          var func = function() { return this[name] };

          if (cls._isSingleton) {
            proto.constructor.prototype['$' + name] = func;
          }
          else {
            proto['$' + name] = func;
            $opal.donate(self, ['$' + name ]);
          }
        })(names[i]);
      }
    ;
      return nil;
    };

    def.$attr_writer = function(names) {
      var self = this;
      names = $slice.call(arguments, 0);
      
      var proto = self._proto, cls = self;
      for (var i = 0, length = names.length; i < length; i++) {
        (function(name) {
          proto[name] = nil;
          var func = function(value) { return this[name] = value; };

          if (cls._isSingleton) {
            proto.constructor.prototype['$' + name + '='] = func;
          }
          else {
            proto['$' + name + '='] = func;
            $opal.donate(self, ['$' + name + '=']);
          }
        })(names[i]);
      }
    ;
      return nil;
    };

    $opal.defn(self, '$attr', def.$attr_accessor);

    def.$constants = function() {
      var self = this;
      return self._scope.constants;
    };

    def['$const_defined?'] = function(name, inherit) {
      var $a, self = this;
      if (inherit == null) {
        inherit = true
      }
      if (($a = name['$=~'](/^[A-Z]\w*$/)) === false || $a === nil) {
        self.$raise($opalScope.NameError, "wrong constant name " + (name))};
      
      scopes = [self._scope];
      if (inherit || self === Opal.Object) {
        var parent = self._super;
        while (parent !== Opal.BasicObject) {
          scopes.push(parent._scope);
          parent = parent._super;
        }
      }

      for (var i = 0, len = scopes.length; i < len; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return true;
        }
      }

      return false;
    ;
    };

    def.$const_get = function(name, inherit) {
      var $a, self = this;
      if (inherit == null) {
        inherit = true
      }
      if (($a = name['$=~'](/^[A-Z]\w*$/)) === false || $a === nil) {
        self.$raise($opalScope.NameError, "wrong constant name " + (name))};
      
      var scopes = [self._scope];
      if (inherit || self == Opal.Object) {
        var parent = self._super;
        while (parent !== Opal.BasicObject) {
          scopes.push(parent._scope);
          parent = parent._super;
        }
      }

      for (var i = 0, len = scopes.length; i < len; i++) {
        if (scopes[i].hasOwnProperty(name)) {
          return scopes[i][name];
        }
      }

      return self.$const_missing(name);
    ;
    };

    def.$const_missing = function(const$) {
      var self = this, name = nil;
      name = self._name;
      return self.$raise($opalScope.NameError, "uninitialized constant " + (name) + "::" + (const$));
    };

    def.$const_set = function(name, value) {
      var $a, self = this;
      if (($a = name['$=~'](/^[A-Z]\w*$/)) === false || $a === nil) {
        self.$raise($opalScope.NameError, "wrong constant name " + (name))};
      try {
      name = name.$to_str()
      } catch ($err) {if (true) {
        self.$raise($opalScope.TypeError, "conversion with #to_str failed")
        }else { throw $err; }
      };
      
      $opal.casgn(self, name, value);
      return value
    ;
    };

    def.$define_method = TMP_2 = function(name, method) {
      var self = this, $iter = TMP_2._p, block = $iter || nil;
      TMP_2._p = null;
      
      if (method) {
        block = method.$to_proc();
      }

      if (block === nil) {
        throw new Error("no block given");
      }

      var jsid    = '$' + name;
      block._jsid = name;
      block._s    = null;
      block._def  = block;

      self._proto[jsid] = block;
      $opal.donate(self, [jsid]);

      return null;
    ;
    };

    def.$remove_method = function(name) {
      var self = this;
      
      var jsid    = '$' + name;
      var current = self._proto[jsid];
      delete self._proto[jsid];

      // Check if we need to reverse $opal.donate
      // $opal.retire(self, [jsid]);
      return self;
    
    };

    def.$include = function(mods) {
      var self = this;
      mods = $slice.call(arguments, 0);
      
      var i = mods.length - 1, mod;
      while (i >= 0) {
        mod = mods[i];
        i--;

        if (mod === self) {
          continue;
        }

        (mod).$append_features(self);
        (mod).$included(self);
      }

      return self;
    
    };

    def.$instance_method = function(name) {
      var self = this;
      
      var meth = self._proto['$' + name];

      if (!meth || meth.rb_stub) {
        self.$raise($opalScope.NameError, "undefined method `" + (name) + "' for class `" + (self.$name()) + "'");
      }

      return $opalScope.UnboundMethod.$new(self, meth, name);
    
    };

    def.$instance_methods = function(include_super) {
      var self = this;
      if (include_super == null) {
        include_super = false
      }
      
      var methods = [], proto = self._proto;

      for (var prop in self._proto) {
        if (!include_super && !proto.hasOwnProperty(prop)) {
          continue;
        }

        if (!include_super && proto[prop]._donated) {
          continue;
        }

        if (prop.charAt(0) === '$') {
          methods.push(prop.substr(1));
        }
      }

      return methods;
    ;
    };

    def.$included = function(mod) {
      var self = this;
      return nil;
    };

    def.$module_eval = TMP_3 = function() {
      var self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      
      if (block === nil) {
        throw new Error("no block given");
      }

      var block_self = block._s, result;

      block._s = null;
      result = block.call(self);
      block._s = block_self;

      return result;
    
    };

    $opal.defn(self, '$class_eval', def.$module_eval);

    def.$module_exec = TMP_4 = function() {
      var self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      
      if (block === nil) {
        throw new Error("no block given");
      }

      var block_self = block._s, result;

      block._s = null;
      result = block.apply(self, $slice.call(arguments));
      block._s = block_self;

      return result;
    
    };

    $opal.defn(self, '$class_exec', def.$module_exec);

    def['$method_defined?'] = function(method) {
      var self = this;
      
      var body = self._proto['$' + method];
      return (!!body) && !body.rb_stub;
    ;
    };

    def.$module_function = function(methods) {
      var self = this;
      methods = $slice.call(arguments, 0);
      
      for (var i = 0, length = methods.length; i < length; i++) {
        var meth = methods[i], func = self._proto['$' + meth];

        self.constructor.prototype['$' + meth] = func;
      }

      return self;
    
    };

    def.$name = function() {
      var self = this;
      
      if (self._full_name) {
        return self._full_name;
      }

      var result = [], base = self;

      while (base) {
        if (base._name === nil) {
          return result.length === 0 ? nil : result.join('::');
        }

        result.unshift(base._name);

        base = base._base_module;

        if (base === $opal.Object) {
          break;
        }
      }

      if (result.length === 0) {
        return nil;
      }

      return self._full_name = result.join('::');
    
    };

    def.$public = function() {
      var self = this;
      return nil;
    };

    def.$private_class_method = function(name) {
      var self = this;
      return self['$' + name] || nil;
    };

    $opal.defn(self, '$private', def.$public);

    $opal.defn(self, '$protected', def.$public);

    def['$private_method_defined?'] = function(obj) {
      var self = this;
      return false;
    };

    $opal.defn(self, '$protected_method_defined?', def['$private_method_defined?']);

    $opal.defn(self, '$public_instance_methods', def.$instance_methods);

    $opal.defn(self, '$public_method_defined?', def['$method_defined?']);

    def.$remove_class_variable = function() {
      var self = this;
      return nil;
    };

    def.$remove_const = function(name) {
      var self = this;
      
      var old = self._scope[name];
      delete self._scope[name];
      return old;
    ;
    };

    def.$to_s = function() {
      var self = this;
      return self.$name().$to_s();
    };

    return (def.$undef_method = function(symbol) {
      var self = this;
      $opal.add_stub_for(self._proto, "$" + symbol);
      return self;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = $Class._proto, $opalScope = $Class._scope, TMP_1, TMP_2;
    $opal.defs(self, '$new', TMP_1 = function(sup) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      if (sup == null) {
        sup = $opalScope.Object
      }
      TMP_1._p = null;
      
      if (!sup._isClass || sup.__mod__) {
        self.$raise($opalScope.TypeError, "superclass must be a Class");
      }

      function AnonClass(){};
      var klass       = Opal.boot(sup, AnonClass)
      klass._name     = nil;
      klass.__parent  = sup;

      // inherit scope from parent
      $opal.create_scope(sup._scope, klass);

      sup.$inherited(klass);

      if (block !== nil) {
        var block_self = block._s;
        block._s = null;
        block.call(klass);
        block._s = block_self;
      }

      return klass;
    ;
    });

    def.$allocate = function() {
      var self = this;
      
      var obj = new self._alloc;
      obj._id = Opal.uid();
      return obj;
    
    };

    def.$inherited = function(cls) {
      var self = this;
      return nil;
    };

    def.$new = TMP_2 = function(args) {
      var self = this, $iter = TMP_2._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_2._p = null;
      
      var obj = self.$allocate();

      obj.$initialize._p = block;
      obj.$initialize.apply(obj, args);
      return obj;
    ;
    };

    return (def.$superclass = function() {
      var self = this;
      return self._super || nil;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $BasicObject(){};
    var self = $BasicObject = $klass($base, $super, 'BasicObject', $BasicObject);

    var def = $BasicObject._proto, $opalScope = $BasicObject._scope, TMP_1, TMP_2, TMP_3, TMP_4;
    $opal.defn(self, '$initialize', function() {
      var self = this;
      return nil;
    });

    $opal.defn(self, '$==', function(other) {
      var self = this;
      return self === other;
    });

    $opal.defn(self, '$__id__', function() {
      var self = this;
      return self._id || (self._id = Opal.uid());
    });

    $opal.defn(self, '$__send__', TMP_1 = function(symbol, args) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_1._p = null;
      
      var func = self['$' + symbol]

      if (func) {
        if (block !== nil) {
          func._p = block;
        }

        return func.apply(self, args);
      }

      if (block !== nil) {
        self.$method_missing._p = block;
      }

      return self.$method_missing.apply(self, [symbol].concat(args));
    
    });

    $opal.defn(self, '$eql?', def['$==']);

    $opal.defn(self, '$equal?', def['$==']);

    $opal.defn(self, '$instance_eval', TMP_2 = function() {
      var $a, self = this, $iter = TMP_2._p, block = $iter || nil;
      TMP_2._p = null;
      if (($a = block) === false || $a === nil) {
        $opalScope.Kernel.$raise($opalScope.ArgumentError, "no block given")};
      
      var block_self = block._s,
          result;

      block._s = null;
      result = block.call(self, self);
      block._s = block_self;

      return result;
    
    });

    $opal.defn(self, '$instance_exec', TMP_3 = function(args) {
      var $a, self = this, $iter = TMP_3._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_3._p = null;
      if (($a = block) === false || $a === nil) {
        $opalScope.Kernel.$raise($opalScope.ArgumentError, "no block given")};
      
      var block_self = block._s,
          result;

      block._s = null;
      result = block.apply(self, args);
      block._s = block_self;

      return result;
    
    });

    return ($opal.defn(self, '$method_missing', TMP_4 = function(symbol, args) {
      var self = this, $iter = TMP_4._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_4._p = null;
      return $opalScope.Kernel.$raise($opalScope.NoMethodError, "undefined method `" + (symbol) + "' for BasicObject instance");
    }), nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $gvars = $opal.gvars;
  return (function($base) {
    var self = $module($base, 'Kernel');

    var def = self._proto, $opalScope = self._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_9;
    def.$method_missing = TMP_1 = function(symbol, args) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_1._p = null;
      return self.$raise($opalScope.NoMethodError, "undefined method `" + (symbol) + "' for " + (self.$inspect()));
    };

    def['$=~'] = function(obj) {
      var self = this;
      return false;
    };

    def['$==='] = function(other) {
      var self = this;
      return self['$=='](other);
    };

    def['$<=>'] = function(other) {
      var self = this;
      
      if (self['$=='](other)) {
        return 0;
      }

      return nil;
    ;
    };

    def.$method = function(name) {
      var self = this;
      
      var meth = self['$' + name];

      if (!meth || meth.rb_stub) {
        self.$raise($opalScope.NameError, "undefined method `" + (name) + "' for class `" + (self.$class().$name()) + "'");
      }

      return $opalScope.Method.$new(self, meth, name);
    
    };

    def.$methods = function(all) {
      var self = this;
      if (all == null) {
        all = true
      }
      
      var methods = [];

      for (var key in self) {
        if (key[0] == "$" && typeof(self[key]) === "function") {
          if (all == false || all === nil) {
            if (!$opal.hasOwnProperty.call(self, key)) {
              continue;
            }
          }

          methods.push(key.substr(1));
        }
      }

      return methods;
    
    };

    def.$Array = TMP_2 = function(object, args) {
      var self = this, $iter = TMP_2._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_2._p = null;
      
      if (object == null || object === nil) {
        return [];
      }
      else if (object['$respond_to?']("to_ary")) {
        return object.$to_ary();
      }
      else if (object['$respond_to?']("to_a")) {
        return object.$to_a();
      }
      else {
        return [object];
      }
    ;
    };

    def.$caller = function() {
      var self = this;
      return [];
    };

    def.$class = function() {
      var self = this;
      return self._klass;
    };

    def.$copy_instance_variables = function(other) {
      var self = this;
      
      for (var name in other) {
        if (name.charAt(0) !== '$') {
          if (name !== '_id' && name !== '_klass') {
            self[name] = other[name];
          }
        }
      }
    
    };

    def.$clone = function() {
      var self = this, copy = nil;
      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$initialize_clone(self);
      return copy;
    };

    def.$initialize_clone = function(other) {
      var self = this;
      return self.$initialize_copy(other);
    };

    self.$private("initialize_clone");

    def.$define_singleton_method = TMP_3 = function(name) {
      var $a, self = this, $iter = TMP_3._p, body = $iter || nil;
      TMP_3._p = null;
      if (($a = body) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "tried to create Proc object without a block")};
      
      var jsid   = '$' + name;
      body._jsid = name;
      body._s    = null;
      body._def  = body;

      self.$singleton_class()._proto[jsid] = body;

      return self;
    
    };

    def.$dup = function() {
      var self = this, copy = nil;
      copy = self.$class().$allocate();
      copy.$copy_instance_variables(self);
      copy.$initialize_dup(self);
      return copy;
    };

    def.$initialize_dup = function(other) {
      var self = this;
      return self.$initialize_copy(other);
    };

    self.$private("initialize_dup");

    def.$enum_for = TMP_4 = function(method, args) {
      var $a, $b, self = this, $iter = TMP_4._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      if (method == null) {
        method = "each"
      }
      TMP_4._p = null;
      return ($a = ($b = $opalScope.Enumerator).$for, $a._p = block.$to_proc(), $a).apply($b, [self, method].concat(args));
    };

    def['$equal?'] = function(other) {
      var self = this;
      return self === other;
    };

    def.$extend = function(mods) {
      var self = this;
      mods = $slice.call(arguments, 0);
      
      for (var i = 0, length = mods.length; i < length; i++) {
        self.$singleton_class().$include(mods[i]);
      }

      return self;
    
    };

    def.$format = function(format, args) {
      var self = this;
      args = $slice.call(arguments, 1);
      
      var idx = 0;
      return format.replace(/%(\d+\$)?([-+ 0]*)(\d*|\*(\d+\$)?)(?:\.(\d*|\*(\d+\$)?))?([cspdiubBoxXfgeEG])|(%%)/g, function(str, idx_str, flags, width_str, w_idx_str, prec_str, p_idx_str, spec, escaped) {
        if (escaped) {
          return '%';
        }

        var width,
        prec,
        is_integer_spec = ("diubBoxX".indexOf(spec) != -1),
        is_float_spec = ("eEfgG".indexOf(spec) != -1),
        prefix = '',
        obj;

        if (width_str === undefined) {
          width = undefined;
        } else if (width_str.charAt(0) == '*') {
          var w_idx = idx++;
          if (w_idx_str) {
            w_idx = parseInt(w_idx_str, 10) - 1;
          }
          width = (args[w_idx]).$to_i();
        } else {
          width = parseInt(width_str, 10);
        }
        if (!prec_str) {
          prec = is_float_spec ? 6 : undefined;
        } else if (prec_str.charAt(0) == '*') {
          var p_idx = idx++;
          if (p_idx_str) {
            p_idx = parseInt(p_idx_str, 10) - 1;
          }
          prec = (args[p_idx]).$to_i();
        } else {
          prec = parseInt(prec_str, 10);
        }
        if (idx_str) {
          idx = parseInt(idx_str, 10) - 1;
        }
        switch (spec) {
        case 'c':
          obj = args[idx];
          if (obj._isString) {
            str = obj.charAt(0);
          } else {
            str = String.fromCharCode((obj).$to_i());
          }
          break;
        case 's':
          str = (args[idx]).$to_s();
          if (prec !== undefined) {
            str = str.substr(0, prec);
          }
          break;
        case 'p':
          str = (args[idx]).$inspect();
          if (prec !== undefined) {
            str = str.substr(0, prec);
          }
          break;
        case 'd':
        case 'i':
        case 'u':
          str = (args[idx]).$to_i().toString();
          break;
        case 'b':
        case 'B':
          str = (args[idx]).$to_i().toString(2);
          break;
        case 'o':
          str = (args[idx]).$to_i().toString(8);
          break;
        case 'x':
        case 'X':
          str = (args[idx]).$to_i().toString(16);
          break;
        case 'e':
        case 'E':
          str = (args[idx]).$to_f().toExponential(prec);
          break;
        case 'f':
          str = (args[idx]).$to_f().toFixed(prec);
          break;
        case 'g':
        case 'G':
          str = (args[idx]).$to_f().toPrecision(prec);
          break;
        }
        idx++;
        if (is_integer_spec || is_float_spec) {
          if (str.charAt(0) == '-') {
            prefix = '-';
            str = str.substr(1);
          } else {
            if (flags.indexOf('+') != -1) {
              prefix = '+';
            } else if (flags.indexOf(' ') != -1) {
              prefix = ' ';
            }
          }
        }
        if (is_integer_spec && prec !== undefined) {
          if (str.length < prec) {
            str = "0"['$*'](prec - str.length) + str;
          }
        }
        var total_len = prefix.length + str.length;
        if (width !== undefined && total_len < width) {
          if (flags.indexOf('-') != -1) {
            str = str + " "['$*'](width - total_len);
          } else {
            var pad_char = ' ';
            if (flags.indexOf('0') != -1) {
              str = "0"['$*'](width - total_len) + str;
            } else {
              prefix = " "['$*'](width - total_len) + prefix;
            }
          }
        }
        var result = prefix + str;
        if ('XEG'.indexOf(spec) != -1) {
          result = result.toUpperCase();
        }
        return result;
      });
    
    };

    def.$hash = function() {
      var self = this;
      return self._id;
    };

    def.$initialize_copy = function(other) {
      var self = this;
      return nil;
    };

    def.$inspect = function() {
      var self = this;
      return self.$to_s();
    };

    def['$instance_of?'] = function(klass) {
      var self = this;
      return self._klass === klass;
    };

    def['$instance_variable_defined?'] = function(name) {
      var self = this;
      return self.hasOwnProperty(name.substr(1));
    };

    def.$instance_variable_get = function(name) {
      var self = this;
      
      var ivar = self[name.substr(1)];

      return ivar == null ? nil : ivar;
    
    };

    def.$instance_variable_set = function(name, value) {
      var self = this;
      return self[name.substr(1)] = value;
    };

    def.$instance_variables = function() {
      var self = this;
      
      var result = [];

      for (var name in self) {
        if (name.charAt(0) !== '$') {
          if (name !== '_klass' && name !== '_id') {
            result.push('@' + name);
          }
        }
      }

      return result;
    
    };

    def.$Integer = function(value, base) {
      var $a, $b, self = this, $case = nil;
      if (base == null) {
        base = nil
      }
      if (($a = $opalScope.String['$==='](value)) !== false && $a !== nil) {
        if (($a = value['$empty?']()) !== false && $a !== nil) {
          self.$raise($opalScope.ArgumentError, "invalid value for Integer: (empty string)")};
        return parseInt(value, ((($a = base) !== false && $a !== nil) ? $a : undefined));};
      if (base !== false && base !== nil) {
        self.$raise(self.$ArgumentError("base is only valid for String values"))};
      return (function() {$case = value;if ($opalScope.Integer['$===']($case)) {return value}else if ($opalScope.Float['$===']($case)) {if (($a = ((($b = value['$nan?']()) !== false && $b !== nil) ? $b : value['$infinite?']())) !== false && $a !== nil) {
        self.$raise($opalScope.FloatDomainError, "unable to coerce " + (value) + " to Integer")};
      return value.$to_int();}else if ($opalScope.NilClass['$===']($case)) {return self.$raise($opalScope.TypeError, "can't convert nil into Integer")}else {if (($a = value['$respond_to?']("to_int")) !== false && $a !== nil) {
        return value.$to_int()
      } else if (($a = value['$respond_to?']("to_i")) !== false && $a !== nil) {
        return value.$to_i()
        } else {
        return self.$raise($opalScope.TypeError, "can't convert " + (value.$class()) + " into Integer")
      }}})();
    };

    def.$Float = function(value) {
      var $a, self = this;
      if (($a = $opalScope.String['$==='](value)) !== false && $a !== nil) {
        return parseFloat(value);
      } else if (($a = value['$respond_to?']("to_f")) !== false && $a !== nil) {
        return value.$to_f()
        } else {
        return self.$raise($opalScope.TypeError, "can't convert " + (value.$class()) + " into Float")
      };
    };

    def['$is_a?'] = function(klass) {
      var self = this;
      return $opal.is_a(self, klass);
    };

    $opal.defn(self, '$kind_of?', def['$is_a?']);

    def.$lambda = TMP_5 = function() {
      var self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      block.is_lambda = true;
      return block;
    };

    def.$loop = TMP_6 = function() {
      var self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      
      while (true) {
        if (block() === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    def['$nil?'] = function() {
      var self = this;
      return false;
    };

    $opal.defn(self, '$object_id', def.$__id__);

    def.$printf = function(args) {
      var $a, self = this;
      args = $slice.call(arguments, 0);
      if (args.$length()['$>'](0)) {
        self.$print(($a = self).$format.apply($a, [].concat(args)))};
      return nil;
    };

    def.$private_methods = function() {
      var self = this;
      return [];
    };

    def.$proc = TMP_7 = function() {
      var $a, self = this, $iter = TMP_7._p, block = $iter || nil;
      TMP_7._p = null;
      if (($a = block) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "tried to create Proc object without a block")};
      block.is_lambda = false;
      return block;
    };

    def.$puts = function(strs) {
      var $a, self = this;
      strs = $slice.call(arguments, 0);
      return ($a = $gvars["stdout"]).$puts.apply($a, [].concat(strs));
    };

    def.$p = function(args) {
      var $a, $b, TMP_8, self = this;
      args = $slice.call(arguments, 0);
      ($a = ($b = args).$each, $a._p = (TMP_8 = function(obj){var self = TMP_8._s || this;if (obj == null) obj = nil;
      return $gvars["stdout"].$puts(obj.$inspect())}, TMP_8._s = self, TMP_8), $a).call($b);
      if (args.$length()['$<='](1)) {
        return args['$[]'](0)
        } else {
        return args
      };
    };

    $opal.defn(self, '$print', def.$puts);

    def.$warn = function(strs) {
      var $a, $b, self = this;
      strs = $slice.call(arguments, 0);
      if (($a = ((($b = $gvars["VERBOSE"]['$nil?']()) !== false && $b !== nil) ? $b : strs['$empty?']())) === false || $a === nil) {
        ($a = $gvars["stderr"]).$puts.apply($a, [].concat(strs))};
      return nil;
    };

    def.$raise = function(exception, string) {
      var self = this;
      
      if (exception == null && $gvars["!"]) {
        exception = $gvars["!"];
      }
      else if (exception._isString) {
        exception = $opalScope.RuntimeError.$new(exception);
      }
      else if (!exception['$is_a?']($opalScope.Exception)) {
        exception = exception.$new(string);
      }

      throw exception;
    ;
    };

    $opal.defn(self, '$fail', def.$raise);

    def.$rand = function(max) {
      var self = this;
      
      if (max === undefined) {
        return Math.random();
      }
      else if (max._isRange) {
        var arr = max.$to_a();

        return arr[self.$rand(arr.length)];
      }
      else {
        return Math.floor(Math.random() *
          Math.abs($opalScope.Opal.$coerce_to(max, $opalScope.Integer, "to_int")));
      }
    
    };

    $opal.defn(self, '$srand', def.$rand);

    def['$respond_to?'] = function(name, include_all) {
      var self = this;
      if (include_all == null) {
        include_all = false
      }
      
      var body = self['$' + name];
      return (!!body) && !body.rb_stub;
    
    };

    $opal.defn(self, '$send', def.$__send__);

    $opal.defn(self, '$public_send', def.$__send__);

    def.$singleton_class = function() {
      var self = this;
      
      if (self._isClass) {
        if (self.__meta__) {
          return self.__meta__;
        }

        var meta = new $opal.Class._alloc;
        meta._klass = $opal.Class;
        self.__meta__ = meta;
        // FIXME - is this right? (probably - methods defined on
        // class' singleton should also go to subclasses?)
        meta._proto = self.constructor.prototype;
        meta._isSingleton = true;
        meta.__inc__ = [];
        meta._methods = [];

        meta._scope = self._scope;

        return meta;
      }

      if (self._isClass) {
        return self._klass;
      }

      if (self.__meta__) {
        return self.__meta__;
      }

      else {
        var orig_class = self._klass,
            class_id   = "#<Class:#<" + orig_class._name + ":" + orig_class._id + ">>";

        var Singleton = function () {};
        var meta = Opal.boot(orig_class, Singleton);
        meta._name = class_id;

        meta._proto = self;
        self.__meta__ = meta;
        meta._klass = orig_class._klass;
        meta._scope = orig_class._scope;
        meta.__parent = orig_class;

        return meta;
      }
    
    };

    $opal.defn(self, '$sprintf', def.$format);

    def.$String = function(str) {
      var self = this;
      return String(str);
    };

    def.$tap = TMP_9 = function() {
      var self = this, $iter = TMP_9._p, block = $iter || nil;
      TMP_9._p = null;
      if ($opal.$yield1(block, self) === $breaker) return $breaker.$v;
      return self;
    };

    def.$to_proc = function() {
      var self = this;
      return self;
    };

    def.$to_s = function() {
      var self = this;
      return "#<" + self.$class().$name() + ":" + self._id + ">";
    };

    def.$freeze = function() {
      var self = this;
      self.___frozen___ = true;
      return self;
    };

    def['$frozen?'] = function() {
      var $a, self = this;
      if (self.___frozen___ == null) self.___frozen___ = nil;

      return ((($a = self.___frozen___) !== false && $a !== nil) ? $a : false);
    };

    def['$respond_to_missing?'] = function(method_name) {
      var self = this;
      return false;
    };
        ;$opal.donate(self, ["$method_missing", "$=~", "$===", "$<=>", "$method", "$methods", "$Array", "$caller", "$class", "$copy_instance_variables", "$clone", "$initialize_clone", "$define_singleton_method", "$dup", "$initialize_dup", "$enum_for", "$equal?", "$extend", "$format", "$hash", "$initialize_copy", "$inspect", "$instance_of?", "$instance_variable_defined?", "$instance_variable_get", "$instance_variable_set", "$instance_variables", "$Integer", "$Float", "$is_a?", "$kind_of?", "$lambda", "$loop", "$nil?", "$object_id", "$printf", "$private_methods", "$proc", "$puts", "$p", "$print", "$warn", "$raise", "$fail", "$rand", "$srand", "$respond_to?", "$send", "$public_send", "$singleton_class", "$sprintf", "$String", "$tap", "$to_proc", "$to_s", "$freeze", "$frozen?", "$respond_to_missing?"]);
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = $NilClass._proto, $opalScope = $NilClass._scope;
    def['$&'] = function(other) {
      var self = this;
      return false;
    };

    def['$|'] = function(other) {
      var self = this;
      return other !== false && other !== nil;
    };

    def['$^'] = function(other) {
      var self = this;
      return other !== false && other !== nil;
    };

    def['$=='] = function(other) {
      var self = this;
      return other === nil;
    };

    def.$dup = function() {
      var self = this;
      return self.$raise($opalScope.TypeError);
    };

    def.$inspect = function() {
      var self = this;
      return "nil";
    };

    def['$nil?'] = function() {
      var self = this;
      return true;
    };

    def.$singleton_class = function() {
      var self = this;
      return $opalScope.NilClass;
    };

    def.$to_a = function() {
      var self = this;
      return [];
    };

    def.$to_h = function() {
      var self = this;
      return $opal.hash();
    };

    def.$to_i = function() {
      var self = this;
      return 0;
    };

    $opal.defn(self, '$to_f', def.$to_i);

    def.$to_s = function() {
      var self = this;
      return "";
    };

    def.$object_id = function() {
      var self = this;
      return $opalScope.NilClass._id || ($opalScope.NilClass._id = $opal.uid());
    };

    return $opal.defn(self, '$hash', def.$object_id);
  })(self, null);
  return $opal.cdecl($opalScope, 'NIL', nil);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = $Boolean._proto, $opalScope = $Boolean._scope;
    def._isBoolean = true;

    (function(self) {
      var $opalScope = self._scope, def = self._proto;
      return self.$undef_method("new")
    })(self.$singleton_class());

    def['$&'] = function(other) {
      var self = this;
      return (self == true) ? (other !== false && other !== nil) : false;
    };

    def['$|'] = function(other) {
      var self = this;
      return (self == true) ? true : (other !== false && other !== nil);
    };

    def['$^'] = function(other) {
      var self = this;
      return (self == true) ? (other === false || other === nil) : (other !== false && other !== nil);
    };

    def['$=='] = function(other) {
      var self = this;
      return (self == true) === other.valueOf();
    };

    $opal.defn(self, '$equal?', def['$==']);

    $opal.defn(self, '$singleton_class', def.$class);

    return (def.$to_s = function() {
      var self = this;
      return (self == true) ? 'true' : 'false';
    }, nil);
  })(self, null);
  $opal.cdecl($opalScope, 'TrueClass', $opalScope.Boolean);
  $opal.cdecl($opalScope, 'FalseClass', $opalScope.Boolean);
  $opal.cdecl($opalScope, 'TRUE', true);
  return $opal.cdecl($opalScope, 'FALSE', false);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $module = $opal.module;
  (function($base, $super) {
    function $Exception(){};
    var self = $Exception = $klass($base, $super, 'Exception', $Exception);

    var def = $Exception._proto, $opalScope = $Exception._scope;
    def.message = nil;
    self.$attr_reader("message");

    $opal.defs(self, '$new', function(message) {
      var self = this;
      if (message == null) {
        message = ""
      }
      
      var err = new Error(message);
      err._klass = self;
      err.name = self._name;
      return err;
    
    });

    def.$backtrace = function() {
      var self = this;
      
      var backtrace = self.stack;

      if (typeof(backtrace) === 'string') {
        return backtrace.split("\n").slice(0, 15);
      }
      else if (backtrace) {
        return backtrace.slice(0, 15);
      }

      return [];
    
    };

    def.$inspect = function() {
      var self = this;
      return "#<" + (self.$class().$name()) + ": '" + (self.message) + "'>";
    };

    return $opal.defn(self, '$to_s', def.$message);
  })(self, null);
  (function($base, $super) {
    function $StandardError(){};
    var self = $StandardError = $klass($base, $super, 'StandardError', $StandardError);

    var def = $StandardError._proto, $opalScope = $StandardError._scope;
    return nil;
  })(self, $opalScope.Exception);
  (function($base, $super) {
    function $SystemCallError(){};
    var self = $SystemCallError = $klass($base, $super, 'SystemCallError', $SystemCallError);

    var def = $SystemCallError._proto, $opalScope = $SystemCallError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $NameError(){};
    var self = $NameError = $klass($base, $super, 'NameError', $NameError);

    var def = $NameError._proto, $opalScope = $NameError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $NoMethodError(){};
    var self = $NoMethodError = $klass($base, $super, 'NoMethodError', $NoMethodError);

    var def = $NoMethodError._proto, $opalScope = $NoMethodError._scope;
    return nil;
  })(self, $opalScope.NameError);
  (function($base, $super) {
    function $RuntimeError(){};
    var self = $RuntimeError = $klass($base, $super, 'RuntimeError', $RuntimeError);

    var def = $RuntimeError._proto, $opalScope = $RuntimeError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $LocalJumpError(){};
    var self = $LocalJumpError = $klass($base, $super, 'LocalJumpError', $LocalJumpError);

    var def = $LocalJumpError._proto, $opalScope = $LocalJumpError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $TypeError(){};
    var self = $TypeError = $klass($base, $super, 'TypeError', $TypeError);

    var def = $TypeError._proto, $opalScope = $TypeError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $ArgumentError(){};
    var self = $ArgumentError = $klass($base, $super, 'ArgumentError', $ArgumentError);

    var def = $ArgumentError._proto, $opalScope = $ArgumentError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $IndexError(){};
    var self = $IndexError = $klass($base, $super, 'IndexError', $IndexError);

    var def = $IndexError._proto, $opalScope = $IndexError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $StopIteration(){};
    var self = $StopIteration = $klass($base, $super, 'StopIteration', $StopIteration);

    var def = $StopIteration._proto, $opalScope = $StopIteration._scope;
    return nil;
  })(self, $opalScope.IndexError);
  (function($base, $super) {
    function $KeyError(){};
    var self = $KeyError = $klass($base, $super, 'KeyError', $KeyError);

    var def = $KeyError._proto, $opalScope = $KeyError._scope;
    return nil;
  })(self, $opalScope.IndexError);
  (function($base, $super) {
    function $RangeError(){};
    var self = $RangeError = $klass($base, $super, 'RangeError', $RangeError);

    var def = $RangeError._proto, $opalScope = $RangeError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $FloatDomainError(){};
    var self = $FloatDomainError = $klass($base, $super, 'FloatDomainError', $FloatDomainError);

    var def = $FloatDomainError._proto, $opalScope = $FloatDomainError._scope;
    return nil;
  })(self, $opalScope.RangeError);
  (function($base, $super) {
    function $IOError(){};
    var self = $IOError = $klass($base, $super, 'IOError', $IOError);

    var def = $IOError._proto, $opalScope = $IOError._scope;
    return nil;
  })(self, $opalScope.StandardError);
  (function($base, $super) {
    function $ScriptError(){};
    var self = $ScriptError = $klass($base, $super, 'ScriptError', $ScriptError);

    var def = $ScriptError._proto, $opalScope = $ScriptError._scope;
    return nil;
  })(self, $opalScope.Exception);
  (function($base, $super) {
    function $SyntaxError(){};
    var self = $SyntaxError = $klass($base, $super, 'SyntaxError', $SyntaxError);

    var def = $SyntaxError._proto, $opalScope = $SyntaxError._scope;
    return nil;
  })(self, $opalScope.ScriptError);
  (function($base, $super) {
    function $NotImplementedError(){};
    var self = $NotImplementedError = $klass($base, $super, 'NotImplementedError', $NotImplementedError);

    var def = $NotImplementedError._proto, $opalScope = $NotImplementedError._scope;
    return nil;
  })(self, $opalScope.ScriptError);
  (function($base, $super) {
    function $SystemExit(){};
    var self = $SystemExit = $klass($base, $super, 'SystemExit', $SystemExit);

    var def = $SystemExit._proto, $opalScope = $SystemExit._scope;
    return nil;
  })(self, $opalScope.Exception);
  return (function($base) {
    var self = $module($base, 'Errno');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $EINVAL(){};
      var self = $EINVAL = $klass($base, $super, 'EINVAL', $EINVAL);

      var def = $EINVAL._proto, $opalScope = $EINVAL._scope, TMP_1;
      return ($opal.defs(self, '$new', TMP_1 = function() {
        var self = this, $iter = TMP_1._p, $yield = $iter || nil;
        TMP_1._p = null;
        return $opal.find_super_dispatcher(self, 'new', TMP_1, null, $EINVAL).apply(self, ["Invalid argument"]);
      }), nil)
    })(self, $opalScope.SystemCallError)
    
  })(self);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $gvars = $opal.gvars;
  return (function($base, $super) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = $Regexp._proto, $opalScope = $Regexp._scope;
    def._isRegexp = true;

    $opal.defs(self, '$escape', function(string) {
      var self = this;
      return string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\^\$\| ]/g, '\\$&');
    });

    $opal.defs(self, '$union', function(parts) {
      var self = this;
      parts = $slice.call(arguments, 0);
      return new RegExp(parts.join(''));
    });

    $opal.defs(self, '$new', function(regexp, options) {
      var self = this;
      return new RegExp(regexp, options);
    });

    def['$=='] = function(other) {
      var self = this;
      return other.constructor == RegExp && self.toString() === other.toString();
    };

    def['$==='] = function(str) {
      var $a, $b, self = this;
      if (($a = ($b = str._isString == null, $b !== false && $b !== nil ?str['$respond_to?']("to_str") : $b)) !== false && $a !== nil) {
        str = str.$to_str()};
      if (($a = str._isString == null) !== false && $a !== nil) {
        return false};
      return self.test(str);
    };

    def['$=~'] = function(string) {
      var $a, self = this;
      if (($a = string === nil) !== false && $a !== nil) {
        $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
        return nil;};
      string = $opalScope.Opal.$coerce_to(string, $opalScope.String, "to_str").$to_s();
      
      var re = self;

      if (re.global) {
        // should we clear it afterwards too?
        re.lastIndex = 0;
      }
      else {
        // rewrite regular expression to add the global flag to capture pre/post match
        re = new RegExp(re.source, 'g' + (re.multiline ? 'm' : '') + (re.ignoreCase ? 'i' : ''));
      }

      var result = re.exec(string);

      if (result) {
        $gvars["~"] = $opalScope.MatchData.$new(re, result);
      }
      else {
        $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
      }

      return result ? result.index : nil;
    
    };

    $opal.defn(self, '$eql?', def['$==']);

    def.$inspect = function() {
      var self = this;
      return self.toString();
    };

    def.$match = function(string, pos) {
      var $a, self = this;
      if (($a = string === nil) !== false && $a !== nil) {
        $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
        return nil;};
      if (($a = string._isString == null) !== false && $a !== nil) {
        if (($a = string['$respond_to?']("to_str")) === false || $a === nil) {
          self.$raise($opalScope.TypeError, "no implicit conversion of " + (string.$class()) + " into String")};
        string = string.$to_str();};
      
      var re = self;

      if (re.global) {
        // should we clear it afterwards too?
        re.lastIndex = 0;
      }
      else {
        re = new RegExp(re.source, 'g' + (re.multiline ? 'm' : '') + (re.ignoreCase ? 'i' : ''));
      }

      var result = re.exec(string);

      if (result) {
        return $gvars["~"] = $opalScope.MatchData.$new(re, result);
      }
      else {
        return $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
      }
    
    };

    def.$source = function() {
      var self = this;
      return self.source;
    };

    return $opal.defn(self, '$to_s', def.$source);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module;
  return (function($base) {
    var self = $module($base, 'Comparable');

    var def = self._proto, $opalScope = self._scope;
    $opal.defs(self, '$normalize', function(what) {
      var $a, self = this;
      if (($a = $opalScope.Integer['$==='](what)) !== false && $a !== nil) {
        return what};
      if (what['$>'](0)) {
        return 1};
      if (what['$<'](0)) {
        return -1};
      return 0;
    });

    def['$=='] = function(other) {
      var $a, self = this, cmp = nil;
      try {
      if (($a = self['$equal?'](other)) !== false && $a !== nil) {
          return true};
        if (($a = cmp = (self['$<=>'](other))) === false || $a === nil) {
          return false};
        return $opalScope.Comparable.$normalize(cmp)['$=='](0);
      } catch ($err) {if ($opalScope.StandardError['$===']($err)) {
        return false
        }else { throw $err; }
      };
    };

    def['$>'] = function(other) {
      var $a, self = this, cmp = nil;
      if (($a = cmp = (self['$<=>'](other))) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")};
      return $opalScope.Comparable.$normalize(cmp)['$>'](0);
    };

    def['$>='] = function(other) {
      var $a, self = this, cmp = nil;
      if (($a = cmp = (self['$<=>'](other))) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")};
      return $opalScope.Comparable.$normalize(cmp)['$>='](0);
    };

    def['$<'] = function(other) {
      var $a, self = this, cmp = nil;
      if (($a = cmp = (self['$<=>'](other))) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")};
      return $opalScope.Comparable.$normalize(cmp)['$<'](0);
    };

    def['$<='] = function(other) {
      var $a, self = this, cmp = nil;
      if (($a = cmp = (self['$<=>'](other))) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")};
      return $opalScope.Comparable.$normalize(cmp)['$<='](0);
    };

    def['$between?'] = function(min, max) {
      var self = this;
      if (self['$<'](min)) {
        return false};
      if (self['$>'](max)) {
        return false};
      return true;
    };
        ;$opal.donate(self, ["$==", "$>", "$>=", "$<", "$<=", "$between?"]);
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module;
  return (function($base) {
    var self = $module($base, 'Enumerable');

    var def = self._proto, $opalScope = self._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_16, TMP_17, TMP_18, TMP_19, TMP_21, TMP_22, TMP_23, TMP_24, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29, TMP_30, TMP_31, TMP_33, TMP_34, TMP_38, TMP_39;
    def['$all?'] = TMP_1 = function() {
      var $a, self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      
      var result = true;

      if (block !== nil) {
        self.$each._p = function() {
          var value = $opal.$yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) === false || $a === nil) {
            result = false;
            return $breaker;
          }
        }
      }
      else {
        self.$each._p = function(obj) {
          if (arguments.length == 1 && ($a = obj) === false || $a === nil) {
            result = false;
            return $breaker;
          }
        }
      }

      self.$each();

      return result;
    
    };

    def['$any?'] = TMP_2 = function() {
      var $a, self = this, $iter = TMP_2._p, block = $iter || nil;
      TMP_2._p = null;
      
      var result = false;

      if (block !== nil) {
        self.$each._p = function() {
          var value = $opal.$yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            result = true;
            return $breaker;
          }
        };
      }
      else {
        self.$each._p = function(obj) {
          if (arguments.length != 1 || ($a = obj) !== false && $a !== nil) {
            result = true;
            return $breaker;
          }
        }
      }

      self.$each();

      return result;
    
    };

    def.$chunk = TMP_3 = function(state) {
      var self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$collect = TMP_4 = function() {
      var self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (block === nil) {
        return self.$enum_for("collect")};
      
      var result = [];

      self.$each._p = function() {
        var value = $opal.$yieldX(block, arguments);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        result.push(value);
      };

      self.$each();

      return result;
    
    };

    def.$collect_concat = TMP_5 = function() {
      var self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$count = TMP_6 = function(object) {
      var $a, self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      
      var result = 0;

      if (object != null) {
        block = function() {
          return $opalScope.Opal.$destructure(arguments)['$=='](object);
        };
      }
      else if (block === nil) {
        block = function() { return true; };
      }

      self.$each._p = function() {
        var value = $opal.$yieldX(block, arguments);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if (($a = value) !== false && $a !== nil) {
          result++;
        }
      }

      self.$each();

      return result;
    
    };

    def.$cycle = TMP_7 = function(n) {
      var $a, self = this, $iter = TMP_7._p, block = $iter || nil;
      if (n == null) {
        n = nil
      }
      TMP_7._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("cycle", n)};
      if (($a = n['$nil?']()) === false || $a === nil) {
        n = $opalScope.Opal['$coerce_to!'](n, $opalScope.Integer, "to_int");
        if (($a = n <= 0) !== false && $a !== nil) {
          return nil};};
      
      var result,
          all  = [];

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        all.push(param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }

      if (all.length === 0) {
        return nil;
      }
    
      if (($a = n['$nil?']()) !== false && $a !== nil) {
        
        while (true) {
          for (var i = 0, length = all.length; i < length; i++) {
            var value = $opal.$yield1(block, all[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }
        }
      
        } else {
        
        while (n > 1) {
          for (var i = 0, length = all.length; i < length; i++) {
            var value = $opal.$yield1(block, all[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }

          n--;
        }
      
      };
    };

    def.$detect = TMP_8 = function(ifnone) {
      var $a, self = this, $iter = TMP_8._p, block = $iter || nil;
      TMP_8._p = null;
      if (block === nil) {
        return self.$enum_for("detect", ifnone)};
      
      var result = undefined;

      self.$each._p = function() {
        var params = $opalScope.Opal.$destructure(arguments),
            value  = $opal.$yield1(block, params);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if (($a = value) !== false && $a !== nil) {
          result = params;
          return $breaker;
        }
      };

      self.$each();

      if (result === undefined && ifnone !== undefined) {
        if (typeof(ifnone) === 'function') {
          result = ifnone();
        }
        else {
          result = ifnone;
        }
      }

      return result === undefined ? nil : result;
    
    };

    def.$drop = function(number) {
      var $a, self = this;
      number = $opalScope.Opal.$coerce_to(number, $opalScope.Integer, "to_int");
      if (($a = number < 0) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "attempt to drop negative size")};
      
      var result  = [],
          current = 0;

      self.$each._p = function() {
        if (number <= current) {
          result.push($opalScope.Opal.$destructure(arguments));
        }

        current++;
      };

      self.$each()

      return result;
    
    };

    def.$drop_while = TMP_9 = function() {
      var $a, self = this, $iter = TMP_9._p, block = $iter || nil;
      TMP_9._p = null;
      if (block === nil) {
        return self.$enum_for("drop_while")};
      
      var result   = [],
          dropping = true;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments);

        if (dropping) {
          var value = $opal.$yield1(block, param);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) === false || $a === nil) {
            dropping = false;
            result.push(param);
          }
        }
        else {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    };

    def.$each_cons = TMP_10 = function(n) {
      var self = this, $iter = TMP_10._p, block = $iter || nil;
      TMP_10._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$each_entry = TMP_11 = function() {
      var self = this, $iter = TMP_11._p, block = $iter || nil;
      TMP_11._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$each_slice = TMP_12 = function(n) {
      var $a, self = this, $iter = TMP_12._p, block = $iter || nil;
      TMP_12._p = null;
      n = $opalScope.Opal.$coerce_to(n, $opalScope.Integer, "to_int");
      if (($a = n <= 0) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "invalid slice size")};
      if (block === nil) {
        return self.$enum_for("each_slice", n)};
      
      var result,
          slice = []

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments);

        slice.push(param);

        if (slice.length === n) {
          if (block(slice) === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          slice = [];
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }

      // our "last" group, if smaller than n then won't have been yielded
      if (slice.length > 0) {
        if (block(slice) === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return nil;
    };

    def.$each_with_index = TMP_13 = function(args) {
      var $a, self = this, $iter = TMP_13._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_13._p = null;
      if (block === nil) {
        return ($a = self).$enum_for.apply($a, ["each_with_index"].concat(args))};
      
      var result,
          index = 0;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = block(param, index);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        index++;
      };

      self.$each.apply(self, args);

      if (result !== undefined) {
        return result;
      }
    
      return self;
    };

    def.$each_with_object = TMP_14 = function(object) {
      var self = this, $iter = TMP_14._p, block = $iter || nil;
      TMP_14._p = null;
      if (block === nil) {
        return self.$enum_for("each_with_object", object)};
      
      var result;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = block(param, object);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }
      };

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return object;
    };

    def.$entries = function(args) {
      var self = this;
      args = $slice.call(arguments, 0);
      
      var result = [];

      self.$each._p = function() {
        result.push($opalScope.Opal.$destructure(arguments));
      };

      self.$each.apply(self, args);

      return result;
    
    };

    $opal.defn(self, '$find', def.$detect);

    def.$find_all = TMP_15 = function() {
      var $a, self = this, $iter = TMP_15._p, block = $iter || nil;
      TMP_15._p = null;
      if (block === nil) {
        return self.$enum_for("find_all")};
      
      var result = [];

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if (($a = value) !== false && $a !== nil) {
          result.push(param);
        }
      };

      self.$each();

      return result;
    
    };

    def.$find_index = TMP_16 = function(object) {
      var $a, self = this, $iter = TMP_16._p, block = $iter || nil;
      TMP_16._p = null;
      if (($a = object === undefined && block === nil) !== false && $a !== nil) {
        return self.$enum_for("find_index")};
      
      var result = nil,
          index  = 0;

      if (object != null) {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments);

          if ((param)['$=='](object)) {
            result = index;
            return $breaker;
          }

          index += 1;
        };
      }
      else if (block !== nil) {
        self.$each._p = function() {
          var value = $opal.$yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            result = index;
            return $breaker;
          }

          index += 1;
        };
      }

      self.$each();

      return result;
    
    };

    def.$first = function(number) {
      var $a, self = this, result = nil;
      if (($a = number === undefined) !== false && $a !== nil) {
        result = nil;
        
        self.$each._p = function() {
          result = $opalScope.Opal.$destructure(arguments);

          return $breaker;
        };

        self.$each();
      ;
        } else {
        result = [];
        number = $opalScope.Opal.$coerce_to(number, $opalScope.Integer, "to_int");
        if (($a = number < 0) !== false && $a !== nil) {
          self.$raise($opalScope.ArgumentError, "attempt to take negative size")};
        if (($a = number == 0) !== false && $a !== nil) {
          return []};
        
        var current = 0,
            number  = $opalScope.Opal.$coerce_to(number, $opalScope.Integer, "to_int");

        self.$each._p = function() {
          result.push($opalScope.Opal.$destructure(arguments));

          if (number <= ++current) {
            return $breaker;
          }
        };

        self.$each();
      ;
      };
      return result;
    };

    $opal.defn(self, '$flat_map', def.$collect_concat);

    def.$grep = TMP_17 = function(pattern) {
      var $a, self = this, $iter = TMP_17._p, block = $iter || nil;
      TMP_17._p = null;
      
      var result = [];

      if (block !== nil) {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments),
              value = pattern['$==='](param);

          if (($a = value) !== false && $a !== nil) {
            value = $opal.$yield1(block, param);

            if (value === $breaker) {
              result = $breaker.$v;
              return $breaker;
            }

            result.push(value);
          }
        };
      }
      else {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments),
              value = pattern['$==='](param);

          if (($a = value) !== false && $a !== nil) {
            result.push(param);
          }
        };
      }

      self.$each();

      return result;
    ;
    };

    def.$group_by = TMP_18 = function() {
      var $a, $b, $c, self = this, $iter = TMP_18._p, block = $iter || nil, hash = nil;
      TMP_18._p = null;
      if (block === nil) {
        return self.$enum_for("group_by")};
      hash = $opalScope.Hash.$new();
      
      var result;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        (($a = value, $b = hash, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))))['$<<'](param);
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }
    
      return hash;
    };

    def['$include?'] = function(obj) {
      var self = this;
      
      var result = false;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments);

        if ((param)['$=='](obj)) {
          result = true;
          return $breaker;
        }
      }

      self.$each();

      return result;
    
    };

    def.$opalInject = TMP_19 = function(object, sym) {
      var self = this, $iter = TMP_19._p, block = $iter || nil;
      TMP_19._p = null;
      
      var result = object;

      if (block !== nil && sym === undefined) {
        self.$each._p = function() {
          var value = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          value = $opal.$yieldX(block, [result, value]);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          result = value;
        };
      }
      else {
        if (sym === undefined) {
          if (!$opalScope.Symbol['$==='](object)) {
            self.$raise($opalScope.TypeError, "" + (object.$inspect()) + " is not a Symbol");
          }

          sym    = object;
          result = undefined;
        }

        self.$each._p = function() {
          var value = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = value;
            return;
          }

          result = (result).$__send__(sym, value);
        };
      }

      self.$each();

      return result;
    ;
    };

    def.$lazy = function() {
      var $a, $b, TMP_20, self = this;
      return ($a = ($b = ($opalScope.Enumerator)._scope.Lazy).$new, $a._p = (TMP_20 = function(enum$, args){var self = TMP_20._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
      return ($a = enum$).$yield.apply($a, [].concat(args))}, TMP_20._s = self, TMP_20), $a).call($b, self, self.$enumerator_size());
    };

    def.$enumerator_size = function() {
      var $a, self = this;
      if (($a = self['$respond_to?']("size")) !== false && $a !== nil) {
        return self.$size()
        } else {
        return nil
      };
    };

    self.$private("enumerator_size");

    $opal.defn(self, '$map', def.$collect);

    def.$max = TMP_21 = function() {
      var self = this, $iter = TMP_21._p, block = $iter || nil;
      TMP_21._p = null;
      
      var result;

      if (block !== nil) {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (value === nil) {
            self.$raise($opalScope.ArgumentError, "comparison failed");
          }

          if (value > 0) {
            result = param;
          }
        };
      }
      else {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if ($opalScope.Opal.$compare(param, result) > 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    };

    def.$max_by = TMP_22 = function() {
      var $a, self = this, $iter = TMP_22._p, block = $iter || nil;
      TMP_22._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("max_by")};
      
      var result,
          by;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((value)['$<=>'](by) > 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    };

    $opal.defn(self, '$member?', def['$include?']);

    def.$min = TMP_23 = function() {
      var self = this, $iter = TMP_23._p, block = $iter || nil;
      TMP_23._p = null;
      
      var result;

      if (block !== nil) {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          var value = block(param, result);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (value === nil) {
            self.$raise($opalScope.ArgumentError, "comparison failed");
          }

          if (value < 0) {
            result = param;
          }
        };
      }
      else {
        self.$each._p = function() {
          var param = $opalScope.Opal.$destructure(arguments);

          if (result === undefined) {
            result = param;
            return;
          }

          if ($opalScope.Opal.$compare(param, result) < 0) {
            result = param;
          }
        };
      }

      self.$each();

      return result === undefined ? nil : result;
    
    };

    def.$min_by = TMP_24 = function() {
      var $a, self = this, $iter = TMP_24._p, block = $iter || nil;
      TMP_24._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("min_by")};
      
      var result,
          by;

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (result === undefined) {
          result = param;
          by     = value;
          return;
        }

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if ((value)['$<=>'](by) < 0) {
          result = param
          by     = value;
        }
      };

      self.$each();

      return result === undefined ? nil : result;
    
    };

    def.$minmax = TMP_25 = function() {
      var self = this, $iter = TMP_25._p, block = $iter || nil;
      TMP_25._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$minmax_by = TMP_26 = function() {
      var self = this, $iter = TMP_26._p, block = $iter || nil;
      TMP_26._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def['$none?'] = TMP_27 = function() {
      var $a, self = this, $iter = TMP_27._p, block = $iter || nil;
      TMP_27._p = null;
      
      var result = true;

      if (block !== nil) {
        self.$each._p = function() {
          var value = $opal.$yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            result = false;
            return $breaker;
          }
        }
      }
      else {
        self.$each._p = function() {
          var value = $opalScope.Opal.$destructure(arguments);

          if (($a = value) !== false && $a !== nil) {
            result = false;
            return $breaker;
          }
        };
      }

      self.$each();

      return result;
    
    };

    def['$one?'] = TMP_28 = function() {
      var $a, self = this, $iter = TMP_28._p, block = $iter || nil;
      TMP_28._p = null;
      
      var result = false;

      if (block !== nil) {
        self.$each._p = function() {
          var value = $opal.$yieldX(block, arguments);

          if (value === $breaker) {
            result = $breaker.$v;
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            if (result === true) {
              result = false;
              return $breaker;
            }

            result = true;
          }
        }
      }
      else {
        self.$each._p = function() {
          var value = $opalScope.Opal.$destructure(arguments);

          if (($a = value) !== false && $a !== nil) {
            if (result === true) {
              result = false;
              return $breaker;
            }

            result = true;
          }
        }
      }

      self.$each();

      return result;
    
    };

    def.$partition = TMP_29 = function() {
      var self = this, $iter = TMP_29._p, block = $iter || nil;
      TMP_29._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    $opal.defn(self, '$reduce', def.$opalInject);

    def.$reverse_each = TMP_30 = function() {
      var self = this, $iter = TMP_30._p, block = $iter || nil;
      TMP_30._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    $opal.defn(self, '$select', def.$find_all);

    def.$slice_before = TMP_31 = function(pattern) {
      var $a, $b, TMP_32, self = this, $iter = TMP_31._p, block = $iter || nil;
      TMP_31._p = null;
      if (($a = pattern === undefined && block === nil || arguments.length > 1) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "wrong number of arguments (" + (arguments.length) + " for 1)")};
      return ($a = ($b = $opalScope.Enumerator).$new, $a._p = (TMP_32 = function(e){var self = TMP_32._s || this, $a;if (e == null) e = nil;
      
        var slice = [];

        if (block !== nil) {
          if (pattern === undefined) {
            self.$each._p = function() {
              var param = $opalScope.Opal.$destructure(arguments),
                  value = $opal.$yield1(block, param);

              if (($a = value) !== false && $a !== nil && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
          else {
            self.$each._p = function() {
              var param = $opalScope.Opal.$destructure(arguments),
                  value = block(param, pattern.$dup());

              if (($a = value) !== false && $a !== nil && slice.length > 0) {
                e['$<<'](slice);
                slice = [];
              }

              slice.push(param);
            };
          }
        }
        else {
          self.$each._p = function() {
            var param = $opalScope.Opal.$destructure(arguments),
                value = pattern['$==='](param);

            if (($a = value) !== false && $a !== nil && slice.length > 0) {
              e['$<<'](slice);
              slice = [];
            }

            slice.push(param);
          };
        }

        self.$each();

        if (slice.length > 0) {
          e['$<<'](slice);
        }
      ;}, TMP_32._s = self, TMP_32), $a).call($b);
    };

    def.$sort = TMP_33 = function() {
      var self = this, $iter = TMP_33._p, block = $iter || nil;
      TMP_33._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$sort_by = TMP_34 = function() {
      var $a, $b, TMP_35, $c, $d, TMP_36, $e, $f, TMP_37, self = this, $iter = TMP_34._p, block = $iter || nil;
      TMP_34._p = null;
      if (block === nil) {
        return self.$enum_for("sort_by")};
      return ($a = ($b = ($c = ($d = ($e = ($f = self).$map, $e._p = (TMP_37 = function(){var self = TMP_37._s || this;
      arg = $opalScope.Opal.$destructure(arguments);
        return [block.$call(arg), arg];}, TMP_37._s = self, TMP_37), $e).call($f)).$sort, $c._p = (TMP_36 = function(a, b){var self = TMP_36._s || this;if (a == null) a = nil;if (b == null) b = nil;
      return a['$[]'](0)['$<=>'](b['$[]'](0))}, TMP_36._s = self, TMP_36), $c).call($d)).$map, $a._p = (TMP_35 = function(arg){var self = TMP_35._s || this;if (arg == null) arg = nil;
      return arg[1];}, TMP_35._s = self, TMP_35), $a).call($b);
    };

    def.$take = function(num) {
      var self = this;
      return self.$first(num);
    };

    def.$take_while = TMP_38 = function() {
      var $a, self = this, $iter = TMP_38._p, block = $iter || nil;
      TMP_38._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("take_while")};
      
      var result = [];

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = $opal.$yield1(block, param);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        if (($a = value) === false || $a === nil) {
          return $breaker;
        }

        result.push(param);
      };

      self.$each();

      return result;
    
    };

    $opal.defn(self, '$to_a', def.$entries);

    def.$zip = TMP_39 = function(lists) {
      var self = this, $iter = TMP_39._p, block = $iter || nil;
      lists = $slice.call(arguments, 0);
      TMP_39._p = null;
      return self.$raise($opalScope.NotImplementedError);
    };
        ;$opal.donate(self, ["$all?", "$any?", "$chunk", "$collect", "$collect_concat", "$count", "$cycle", "$detect", "$drop", "$drop_while", "$each_cons", "$each_entry", "$each_slice", "$each_with_index", "$each_with_object", "$entries", "$find", "$find_all", "$find_index", "$first", "$flat_map", "$grep", "$group_by", "$include?", "$opalInject", "$lazy", "$enumerator_size", "$map", "$max", "$max_by", "$member?", "$min", "$min_by", "$minmax", "$minmax_by", "$none?", "$one?", "$partition", "$reduce", "$reverse_each", "$select", "$slice_before", "$sort", "$sort_by", "$take", "$take_while", "$to_a", "$zip"]);
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Enumerator(){};
    var self = $Enumerator = $klass($base, $super, 'Enumerator', $Enumerator);

    var def = $Enumerator._proto, $opalScope = $Enumerator._scope, TMP_1, TMP_2, TMP_3, TMP_4;
    def.size = def.object = def.method = def.args = nil;
    self.$include($opalScope.Enumerable);

    $opal.defs(self, '$for', TMP_1 = function(object, method, args) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 2);
      if (method == null) {
        method = "each"
      }
      TMP_1._p = null;
      
      var obj = self.$allocate();

      obj.object = object;
      obj.size   = block;
      obj.method = method;
      obj.args   = args;

      return obj;
    ;
    });

    def.$initialize = TMP_2 = function() {
      var $a, $b, self = this, $iter = TMP_2._p, block = $iter || nil;
      TMP_2._p = null;
      if (block !== false && block !== nil) {
        self.object = ($a = ($b = $opalScope.Generator).$new, $a._p = block.$to_proc(), $a).call($b);
        self.method = "each";
        self.args = [];
        self.size = arguments[0] || nil;
        if (($a = self.size) !== false && $a !== nil) {
          return self.size = $opalScope.Opal.$coerce_to(self.size, $opalScope.Integer, "to_int")
          } else {
          return nil
        };
        } else {
        self.object = arguments[0];
        self.method = arguments[1] || "each";
        self.args = $slice.call(arguments, 2);
        return self.size = nil;
      };
    };

    def.$each = TMP_3 = function() {
      var $a, $b, self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      if (($a = block) === false || $a === nil) {
        return self};
      return ($a = ($b = self.object).$__send__, $a._p = block.$to_proc(), $a).apply($b, [self.method].concat(self.args));
    };

    def.$size = function() {
      var $a, self = this;
      if (($a = $opalScope.Proc['$==='](self.size)) !== false && $a !== nil) {
        return ($a = self.size).$call.apply($a, [].concat(self.args))
        } else {
        return self.size
      };
    };

    def.$with_index = TMP_4 = function(offset) {
      var $a, self = this, $iter = TMP_4._p, block = $iter || nil;
      if (offset == null) {
        offset = 0
      }
      TMP_4._p = null;
      if (offset !== false && offset !== nil) {
        offset = $opalScope.Opal.$coerce_to(offset, $opalScope.Integer, "to_int")
        } else {
        offset = 0
      };
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("with_index", offset)};
      
      var result

      self.$each._p = function() {
        var param = $opalScope.Opal.$destructure(arguments),
            value = block(param, index);

        if (value === $breaker) {
          result = $breaker.$v;
          return $breaker;
        }

        index++;
      }

      self.$each();

      if (result !== undefined) {
        return result;
      }
    ;
    };

    $opal.defn(self, '$with_object', def.$each_with_object);

    def.$inspect = function() {
      var $a, self = this, result = nil;
      result = "#<" + (self.$class().$name()) + ": " + (self.object.$inspect()) + ":" + (self.method);
      if (($a = self.args['$empty?']()) === false || $a === nil) {
        result = result['$+']("(" + (self.args.$inspect()['$[]']($opalScope.Range.$new(1, -2))) + ")")};
      return result['$+'](">");
    };

    (function($base, $super) {
      function $Generator(){};
      var self = $Generator = $klass($base, $super, 'Generator', $Generator);

      var def = $Generator._proto, $opalScope = $Generator._scope, TMP_5, TMP_6;
      def.block = nil;
      self.$include($opalScope.Enumerable);

      def.$initialize = TMP_5 = function() {
        var $a, self = this, $iter = TMP_5._p, block = $iter || nil;
        TMP_5._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.LocalJumpError, "no block given")};
        return self.block = block;
      };

      return (def.$each = TMP_6 = function(args) {
        var $a, $b, self = this, $iter = TMP_6._p, block = $iter || nil, yielder = nil;
        args = $slice.call(arguments, 0);
        TMP_6._p = null;
        yielder = ($a = ($b = $opalScope.Yielder).$new, $a._p = block.$to_proc(), $a).call($b);
        
        try {
          args.unshift(yielder);

          if ($opal.$yieldX(self.block, args) === $breaker) {
            return $breaker.$v;
          }
        }
        catch (e) {
          if (e === $breaker) {
            return $breaker.$v;
          }
          else {
            throw e;
          }
        }
      ;
        return self;
      }, nil);
    })(self, null);

    (function($base, $super) {
      function $Yielder(){};
      var self = $Yielder = $klass($base, $super, 'Yielder', $Yielder);

      var def = $Yielder._proto, $opalScope = $Yielder._scope, TMP_7;
      def.block = nil;
      def.$initialize = TMP_7 = function() {
        var self = this, $iter = TMP_7._p, block = $iter || nil;
        TMP_7._p = null;
        return self.block = block;
      };

      def.$yield = function(values) {
        var self = this;
        values = $slice.call(arguments, 0);
        
        var value = $opal.$yieldX(self.block, values);

        if (value === $breaker) {
          throw $breaker;
        }

        return value;
      ;
      };

      return (def['$<<'] = function(values) {
        var $a, self = this;
        values = $slice.call(arguments, 0);
        ($a = self).$yield.apply($a, [].concat(values));
        return self;
      }, nil);
    })(self, null);

    return (function($base, $super) {
      function $Lazy(){};
      var self = $Lazy = $klass($base, $super, 'Lazy', $Lazy);

      var def = $Lazy._proto, $opalScope = $Lazy._scope, TMP_8, TMP_11, TMP_13, TMP_18, TMP_20, TMP_21, TMP_23, TMP_26, TMP_29;
      def.enumerator = nil;
      (function($base, $super) {
        function $StopLazyError(){};
        var self = $StopLazyError = $klass($base, $super, 'StopLazyError', $StopLazyError);

        var def = $StopLazyError._proto, $opalScope = $StopLazyError._scope;
        return nil;
      })(self, $opalScope.Exception);

      def.$initialize = TMP_8 = function(object, size) {
        var TMP_9, self = this, $iter = TMP_8._p, block = $iter || nil;
        if (size == null) {
          size = nil
        }
        TMP_8._p = null;
        if (block === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy new without a block")};
        self.enumerator = object;
        return $opal.find_super_dispatcher(self, 'initialize', TMP_8, (TMP_9 = function(yielder, each_args){var self = TMP_9._s || this, $a, $b, TMP_10;if (yielder == null) yielder = nil;each_args = $slice.call(arguments, 1);
        try {
          return ($a = ($b = object).$each, $a._p = (TMP_10 = function(args){var self = TMP_10._s || this;args = $slice.call(arguments, 0);
            
              args.unshift(yielder);

              if ($opal.$yieldX(block, args) === $breaker) {
                return $breaker;
              }
            ;}, TMP_10._s = self, TMP_10), $a).apply($b, [].concat(each_args))
          } catch ($err) {if ($opalScope.Exception['$===']($err)) {
            return nil
            }else { throw $err; }
          }}, TMP_9._s = self, TMP_9)).apply(self, [size]);
      };

      $opal.defn(self, '$force', def.$to_a);

      def.$lazy = function() {
        var self = this;
        return self;
      };

      def.$collect = TMP_11 = function() {
        var $a, $b, TMP_12, self = this, $iter = TMP_11._p, block = $iter || nil;
        TMP_11._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy map without a block")};
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_12 = function(enum$, args){var self = TMP_12._s || this;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = $opal.$yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          enum$.$yield(value);
        }, TMP_12._s = self, TMP_12), $a).call($b, self, self.$enumerator_size());
      };

      def.$collect_concat = TMP_13 = function() {
        var $a, $b, TMP_14, self = this, $iter = TMP_13._p, block = $iter || nil;
        TMP_13._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy map without a block")};
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_14 = function(enum$, args){var self = TMP_14._s || this, $a, $b, TMP_15, $c, TMP_16;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = $opal.$yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if ((value)['$respond_to?']("force") && (value)['$respond_to?']("each")) {
            ($a = ($b = (value)).$each, $a._p = (TMP_15 = function(v){var self = TMP_15._s || this;if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_15._s = self, TMP_15), $a).call($b)
          }
          else {
            var array = $opalScope.Opal.$try_convert(value, $opalScope.Array, "to_ary");

            if (array === nil) {
              enum$.$yield(value);
            }
            else {
              ($a = ($c = (value)).$each, $a._p = (TMP_16 = function(v){var self = TMP_16._s || this;if (v == null) v = nil;
          return enum$.$yield(v)}, TMP_16._s = self, TMP_16), $a).call($c);
            }
          }
        ;}, TMP_14._s = self, TMP_14), $a).call($b, self, nil);
      };

      def.$drop = function(n) {
        var $a, $b, TMP_17, self = this, current_size = nil, set_size = nil, dropped = nil;
        n = $opalScope.Opal.$coerce_to(n, $opalScope.Integer, "to_int");
        if (n['$<'](0)) {
          self.$raise($opalScope.ArgumentError, "attempt to drop negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if (($a = $opalScope.Integer['$==='](current_size)) !== false && $a !== nil) {
          if (n['$<'](current_size)) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        dropped = 0;
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_17 = function(enum$, args){var self = TMP_17._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if (dropped['$<'](n)) {
            return dropped = dropped['$+'](1)
            } else {
            return ($a = enum$).$yield.apply($a, [].concat(args))
          }}, TMP_17._s = self, TMP_17), $a).call($b, self, set_size);
      };

      def.$drop_while = TMP_18 = function() {
        var $a, $b, TMP_19, self = this, $iter = TMP_18._p, block = $iter || nil, succeeding = nil;
        TMP_18._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy drop_while without a block")};
        succeeding = true;
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_19 = function(enum$, args){var self = TMP_19._s || this, $a, $b;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if (succeeding !== false && succeeding !== nil) {
            
            var value = $opal.$yieldX(block, args);

            if (value === $breaker) {
              return $breaker;
            }

            if (($a = value) === false || $a === nil) {
              succeeding = false;

              ($a = enum$).$yield.apply($a, [].concat(args));
            }
          
            } else {
            return ($b = enum$).$yield.apply($b, [].concat(args))
          }}, TMP_19._s = self, TMP_19), $a).call($b, self, nil);
      };

      def.$enum_for = TMP_20 = function(method, args) {
        var $a, $b, self = this, $iter = TMP_20._p, block = $iter || nil;
        args = $slice.call(arguments, 1);
        if (method == null) {
          method = "each"
        }
        TMP_20._p = null;
        return ($a = ($b = self.$class()).$for, $a._p = block.$to_proc(), $a).apply($b, [self, method].concat(args));
      };

      def.$find_all = TMP_21 = function() {
        var $a, $b, TMP_22, self = this, $iter = TMP_21._p, block = $iter || nil;
        TMP_21._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy select without a block")};
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_22 = function(enum$, args){var self = TMP_22._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = $opal.$yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            ($a = enum$).$yield.apply($a, [].concat(args));
          }
        ;}, TMP_22._s = self, TMP_22), $a).call($b, self, nil);
      };

      $opal.defn(self, '$flat_map', def.$collect_concat);

      def.$grep = TMP_23 = function(pattern) {
        var $a, $b, TMP_24, $c, TMP_25, self = this, $iter = TMP_23._p, block = $iter || nil;
        TMP_23._p = null;
        if (block !== false && block !== nil) {
          return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_24 = function(enum$, args){var self = TMP_24._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
          
            var param = $opalScope.Opal.$destructure(args),
                value = pattern['$==='](param);

            if (($a = value) !== false && $a !== nil) {
              value = $opal.$yield1(block, param);

              if (value === $breaker) {
                return $breaker;
              }

              enum$.$yield($opal.$yield1(block, param));
            }
          ;}, TMP_24._s = self, TMP_24), $a).call($b, self, nil)
          } else {
          return ($a = ($c = $opalScope.Lazy).$new, $a._p = (TMP_25 = function(enum$, args){var self = TMP_25._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
          
            var param = $opalScope.Opal.$destructure(args),
                value = pattern['$==='](param);

            if (($a = value) !== false && $a !== nil) {
              enum$.$yield(param);
            }
          ;}, TMP_25._s = self, TMP_25), $a).call($c, self, nil)
        };
      };

      $opal.defn(self, '$map', def.$collect);

      $opal.defn(self, '$select', def.$find_all);

      def.$reject = TMP_26 = function() {
        var $a, $b, TMP_27, self = this, $iter = TMP_26._p, block = $iter || nil;
        TMP_26._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy reject without a block")};
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_27 = function(enum$, args){var self = TMP_27._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = $opal.$yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if (($a = value) === false || $a === nil) {
            ($a = enum$).$yield.apply($a, [].concat(args));
          }
        ;}, TMP_27._s = self, TMP_27), $a).call($b, self, nil);
      };

      def.$take = function(n) {
        var $a, $b, TMP_28, self = this, current_size = nil, set_size = nil, taken = nil;
        n = $opalScope.Opal.$coerce_to(n, $opalScope.Integer, "to_int");
        if (n['$<'](0)) {
          self.$raise($opalScope.ArgumentError, "attempt to take negative size")};
        current_size = self.$enumerator_size();
        set_size = (function() {if (($a = $opalScope.Integer['$==='](current_size)) !== false && $a !== nil) {
          if (n['$<'](current_size)) {
            return n
            } else {
            return current_size
          }
          } else {
          return current_size
        }; return nil; })();
        taken = 0;
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_28 = function(enum$, args){var self = TMP_28._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        if (taken['$<'](n)) {
            ($a = enum$).$yield.apply($a, [].concat(args));
            return taken = taken['$+'](1);
            } else {
            return self.$raise($opalScope.StopLazyError)
          }}, TMP_28._s = self, TMP_28), $a).call($b, self, set_size);
      };

      def.$take_while = TMP_29 = function() {
        var $a, $b, TMP_30, self = this, $iter = TMP_29._p, block = $iter || nil;
        TMP_29._p = null;
        if (($a = block) === false || $a === nil) {
          self.$raise($opalScope.ArgumentError, "tried to call lazy take_while without a block")};
        return ($a = ($b = $opalScope.Lazy).$new, $a._p = (TMP_30 = function(enum$, args){var self = TMP_30._s || this, $a;if (enum$ == null) enum$ = nil;args = $slice.call(arguments, 1);
        
          var value = $opal.$yieldX(block, args);

          if (value === $breaker) {
            return $breaker;
          }

          if (($a = value) !== false && $a !== nil) {
            ($a = enum$).$yield.apply($a, [].concat(args));
          }
          else {
            self.$raise($opalScope.StopLazyError);
          }
        ;}, TMP_30._s = self, TMP_30), $a).call($b, self, nil);
      };

      $opal.defn(self, '$to_enum', def.$enum_for);

      return (def.$inspect = function() {
        var self = this;
        return "#<" + (self.$class().$name()) + ": " + (self.enumerator.$inspect()) + ">";
      }, nil);
    })(self, self);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $range = $opal.range;
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = $Array._proto, $opalScope = $Array._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12, TMP_13, TMP_14, TMP_15, TMP_17, TMP_18, TMP_19, TMP_20, TMP_21, TMP_24;
    def.length = nil;
    self.$include($opalScope.Enumerable);

    def._isArray = true;

    $opal.defs(self, '$inherited', function(klass) {
      var self = this, replace = nil;
      replace = $opalScope.Class.$new(($opalScope.Array)._scope.Wrapper);
      
      klass._proto        = replace._proto;
      klass._proto._klass = klass;
      klass._alloc        = replace._alloc;
      klass.__parent      = ($opalScope.Array)._scope.Wrapper;

      klass.$allocate = replace.$allocate;
      klass.$new      = replace.$new;
      klass["$[]"]    = replace["$[]"];
    
    });

    $opal.defs(self, '$[]', function(objects) {
      var self = this;
      objects = $slice.call(arguments, 0);
      return objects;
    });

    def.$initialize = function(args) {
      var $a, self = this;
      args = $slice.call(arguments, 0);
      return ($a = self.$class()).$new.apply($a, [].concat(args));
    };

    $opal.defs(self, '$new', TMP_1 = function(size, obj) {
      var $a, self = this, $iter = TMP_1._p, block = $iter || nil;
      if (size == null) {
        size = nil
      }
      if (obj == null) {
        obj = nil
      }
      TMP_1._p = null;
      if (($a = arguments.length > 2) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "wrong number of arguments (" + (arguments.length) + " for 0..2)")};
      if (($a = arguments.length === 0) !== false && $a !== nil) {
        return []};
      if (($a = arguments.length === 1) !== false && $a !== nil) {
        if (($a = $opalScope.Array['$==='](size)) !== false && $a !== nil) {
          return size.$to_a()
        } else if (($a = size['$respond_to?']("to_ary")) !== false && $a !== nil) {
          return size.$to_ary()}};
      size = $opalScope.Opal.$coerce_to(size, $opalScope.Integer, "to_int");
      if (($a = size < 0) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "negative array size")};
      
      var result = [];

      if (block === nil) {
        for (var i = 0; i < size; i++) {
          result.push(obj);
        }
      }
      else {
        for (var i = 0, value; i < size; i++) {
          value = block(i);

          if (value === $breaker) {
            return $breaker.$v;
          }

          result[i] = value;
        }
      }

      return result;
    
    });

    $opal.defs(self, '$try_convert', function(obj) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](obj)) !== false && $a !== nil) {
        return obj};
      if (($a = obj['$respond_to?']("to_ary")) !== false && $a !== nil) {
        return obj.$to_ary()};
      return nil;
    });

    def['$&'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Array, "to_ary").$to_a()
      };
      
      var result = [],
          seen   = {};

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self[i];

        if (!seen[item]) {
          for (var j = 0, length2 = other.length; j < length2; j++) {
            var item2 = other[j];

            if (!seen[item2] && (item)['$=='](item2)) {
              seen[item] = true;
              result.push(item);
            }
          }
        }
      }

      return result;
    
    };

    def['$*'] = function(other) {
      var $a, self = this;
      if (($a = other['$respond_to?']("to_str")) !== false && $a !== nil) {
        return self.join(other.$to_str())};
      if (($a = other['$respond_to?']("to_int")) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "no implicit conversion of " + (other.$class()) + " into Integer")};
      other = $opalScope.Opal.$coerce_to(other, $opalScope.Integer, "to_int");
      if (($a = other < 0) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "negative argument")};
      
      var result = [];

      for (var i = 0; i < other; i++) {
        result = result.concat(self);
      }

      return result;
    
    };

    def['$+'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Array, "to_ary").$to_a()
      };
      return self.concat(other);
    };

    def['$-'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Array, "to_ary").$to_a()
      };
      if (($a = self.length === 0) !== false && $a !== nil) {
        return []};
      if (($a = other.length === 0) !== false && $a !== nil) {
        return self.$clone()};
      
      var seen   = {},
          result = [];

      for (var i = 0, length = other.length; i < length; i++) {
        seen[other[i]] = true;
      }

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self[i];

        if (!seen[item]) {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$<<'] = function(object) {
      var self = this;
      self.push(object);
      return self;
    };

    def['$<=>'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
      } else if (($a = other['$respond_to?']("to_ary")) !== false && $a !== nil) {
        other = other.$to_ary().$to_a()
        } else {
        return nil
      };
      
      if (self.$hash() === other.$hash()) {
        return 0;
      }

      if (self.length != other.length) {
        return (self.length > other.length) ? 1 : -1;
      }

      for (var i = 0, length = self.length; i < length; i++) {
        var tmp = (self[i])['$<=>'](other[i]);

        if (tmp !== 0) {
          return tmp;
        }
      }

      return 0;
    ;
    };

    def['$=='] = function(other) {
      var $a, self = this;
      if (($a = self === other) !== false && $a !== nil) {
        return true};
      if (($a = $opalScope.Array['$==='](other)) === false || $a === nil) {
        if (($a = other['$respond_to?']("to_ary")) === false || $a === nil) {
          return false};
        return other['$=='](self);};
      other = other.$to_a();
      if (($a = self.length === other.length) === false || $a === nil) {
        return false};
      
      for (var i = 0, length = self.length; i < length; i++) {
        var a = self[i],
            b = other[i];

        if (a._isArray && b._isArray && (a === self)) {
          continue;
        }

        if (!(a)['$=='](b)) {
          return false;
        }
      }
    
      return true;
    };

    def['$[]'] = function(index, length) {
      var $a, self = this;
      if (($a = $opalScope.Range['$==='](index)) !== false && $a !== nil) {
        
        var size    = self.length,
            exclude = index.exclude,
            from    = $opalScope.Opal.$coerce_to(index.begin, $opalScope.Integer, "to_int"),
            to      = $opalScope.Opal.$coerce_to(index.end, $opalScope.Integer, "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            return nil;
          }
        }

        $opalScope.Opal['$fits_fixnum!'](from);

        if (from > size) {
          return nil;
        }

        if (to < 0) {
          to += size;

          if (to < 0) {
            return [];
          }
        }

        $opalScope.Opal['$fits_fixnum!'](to);

        if (!exclude) {
          to += 1;
        }

        return self.slice(from, to);
      ;
        } else {
        index = $opalScope.Opal.$coerce_to(index, $opalScope.Integer, "to_int");
        
        var size = self.length;

        if (index < 0) {
          index += size;

          if (index < 0) {
            return nil;
          }
        }

        $opalScope.Opal['$fits_fixnum!'](index);

        if (length === undefined) {
          if (index >= size || index < 0) {
            return nil;
          }

          return self[index];
        }
        else {
          length = $opalScope.Opal.$coerce_to(length, $opalScope.Integer, "to_int");

          $opalScope.Opal['$fits_fixnum!'](length);

          if (length < 0 || index > size || index < 0) {
            return nil;
          }

          return self.slice(index, index + length);
        }
      
      };
    };

    def['$[]='] = function(index, value, extra) {
      var $a, self = this, data = nil, length = nil;
      if (($a = $opalScope.Range['$==='](index)) !== false && $a !== nil) {
        if (($a = $opalScope.Array['$==='](value)) !== false && $a !== nil) {
          data = value.$to_a()
        } else if (($a = value['$respond_to?']("to_ary")) !== false && $a !== nil) {
          data = value.$to_ary().$to_a()
          } else {
          data = [value]
        };
        
        var size    = self.length,
            exclude = index.exclude,
            from    = $opalScope.Opal.$coerce_to(index.begin, $opalScope.Integer, "to_int"),
            to      = $opalScope.Opal.$coerce_to(index.end, $opalScope.Integer, "to_int");

        if (from < 0) {
          from += size;

          if (from < 0) {
            self.$raise($opalScope.RangeError, "" + (index.$inspect()) + " out of range");
          }
        }

        $opalScope.Opal['$fits_fixnum!'](from);

        if (to < 0) {
          to += size;
        }

        $opalScope.Opal['$fits_fixnum!'](to);

        if (!exclude) {
          to += 1;
        }

        if (from > size) {
          for (var i = size; i < index; i++) {
            self[i] = nil;
          }
        }

        if (to < 0) {
          self.splice.apply(self, [from, 0].concat(data));
        }
        else {
          self.splice.apply(self, [from, to - from].concat(data));
        }

        return value;
      ;
        } else {
        if (($a = extra === undefined) !== false && $a !== nil) {
          length = 1
          } else {
          length = value;
          value = extra;
          if (($a = $opalScope.Array['$==='](value)) !== false && $a !== nil) {
            data = value.$to_a()
          } else if (($a = value['$respond_to?']("to_ary")) !== false && $a !== nil) {
            data = value.$to_ary().$to_a()
            } else {
            data = [value]
          };
        };
        
        var size   = self.length,
            index  = $opalScope.Opal.$coerce_to(index, $opalScope.Integer, "to_int"),
            length = $opalScope.Opal.$coerce_to(length, $opalScope.Integer, "to_int"),
            old;

        if (index < 0) {
          old    = index;
          index += size;

          if (index < 0) {
            self.$raise($opalScope.IndexError, "index " + (old) + " too small for array; minimum " + (-self.length));
          }
        }

        $opalScope.Opal['$fits_fixnum!'](index);

        if (length < 0) {
          self.$raise($opalScope.IndexError, "negative length (" + (length) + ")")
        }

        $opalScope.Opal['$fits_fixnum!'](length);

        if (index > size) {
          for (var i = size; i < index; i++) {
            self[i] = nil;
          }
        }

        if (extra === undefined) {
          self[index] = value;
        }
        else {
          self.splice.apply(self, [index, length].concat(data));
        }

        return value;
      ;
      };
    };

    def.$assoc = function(object) {
      var self = this;
      
      for (var i = 0, length = self.length, item; i < length; i++) {
        if (item = self[i], item.length && (item[0])['$=='](object)) {
          return item;
        }
      }

      return nil;
    
    };

    def.$at = function(index) {
      var self = this;
      index = $opalScope.Opal.$coerce_to(index, $opalScope.Integer, "to_int");
      
      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self[index];
    
    };

    def.$cycle = TMP_2 = function(n) {
      var $a, $b, self = this, $iter = TMP_2._p, block = $iter || nil;
      if (n == null) {
        n = nil
      }
      TMP_2._p = null;
      if (($a = ((($b = self['$empty?']()) !== false && $b !== nil) ? $b : n['$=='](0))) !== false && $a !== nil) {
        return nil};
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("cycle", n)};
      if (($a = n['$nil?']()) !== false && $a !== nil) {
        
        while (true) {
          for (var i = 0, length = self.length; i < length; i++) {
            var value = $opal.$yield1(block, self[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }
        }
      
        } else {
        n = $opalScope.Opal['$coerce_to!'](n, $opalScope.Integer, "to_int");
        
        if (n <= 0) {
          return self;
        }

        while (n > 0) {
          for (var i = 0, length = self.length; i < length; i++) {
            var value = $opal.$yield1(block, self[i]);

            if (value === $breaker) {
              return $breaker.$v;
            }
          }

          n--;
        }
      
      };
      return self;
    };

    def.$clear = function() {
      var self = this;
      self.splice(0, self.length);
      return self;
    };

    def.$clone = function() {
      var self = this, copy = nil;
      copy = [];
      copy.$initialize_clone(self);
      return copy;
    };

    def.$dup = function() {
      var self = this, copy = nil;
      copy = [];
      copy.$initialize_dup(self);
      return copy;
    };

    def.$initialize_copy = function(other) {
      var self = this;
      return self.$replace(other);
    };

    def.$collect = TMP_3 = function() {
      var self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      if (block === nil) {
        return self.$enum_for("collect")};
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.$yield1(block, self[i]);

        if (value === $breaker) {
          return $breaker.$v;
        }

        result.push(value);
      }

      return result;
    
    };

    def['$collect!'] = TMP_4 = function() {
      var self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (block === nil) {
        return self.$enum_for("collect!")};
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = Opal.$yield1(block, self[i]);

        if (value === $breaker) {
          return $breaker.$v;
        }

        self[i] = value;
      }
    
      return self;
    };

    def.$compact = function() {
      var self = this;
      
      var result = [];

      for (var i = 0, length = self.length, item; i < length; i++) {
        if ((item = self[i]) !== nil) {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$compact!'] = function() {
      var self = this;
      
      var original = self.length;

      for (var i = 0, length = self.length; i < length; i++) {
        if (self[i] === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : self;
    
    };

    def.$concat = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Array, "to_ary").$to_a()
      };
      
      for (var i = 0, length = other.length; i < length; i++) {
        self.push(other[i]);
      }
    
      return self;
    };

    def.$delete = function(object) {
      var self = this;
      
      var original = self.length;

      for (var i = 0, length = original; i < length; i++) {
        if ((self[i])['$=='](object)) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : object;
    
    };

    def.$delete_at = function(index) {
      var self = this;
      
      if (index < 0) {
        index += self.length;
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      var result = self[index];

      self.splice(index, 1);

      return result;
    
    };

    def.$delete_if = TMP_5 = function() {
      var self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      if (block === nil) {
        return self.$enum_for("delete_if")};
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    };

    def.$drop = function(number) {
      var self = this;
      
      if (number < 0) {
        self.$raise($opalScope.ArgumentError)
      }

      return self.slice(number);
    ;
    };

    $opal.defn(self, '$dup', def.$clone);

    def.$each = TMP_6 = function() {
      var self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      if (block === nil) {
        return self.$enum_for("each")};
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = $opal.$yield1(block, self[i]);

        if (value == $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    def.$each_index = TMP_7 = function() {
      var self = this, $iter = TMP_7._p, block = $iter || nil;
      TMP_7._p = null;
      if (block === nil) {
        return self.$enum_for("each_index")};
      
      for (var i = 0, length = self.length; i < length; i++) {
        var value = $opal.$yield1(block, i);

        if (value === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    def['$empty?'] = function() {
      var self = this;
      return self.length === 0;
    };

    def['$eql?'] = function(other) {
      var $a, self = this;
      if (($a = self === other) !== false && $a !== nil) {
        return true};
      if (($a = $opalScope.Array['$==='](other)) === false || $a === nil) {
        return false};
      other = other.$to_a();
      if (($a = self.length === other.length) === false || $a === nil) {
        return false};
      
      for (var i = 0, length = self.length; i < length; i++) {
        var a = self[i],
            b = other[i];

        if (a._isArray && b._isArray && (a === self)) {
          continue;
        }

        if (!(a)['$eql?'](b)) {
          return false;
        }
      }
    
      return true;
    };

    def.$fetch = TMP_8 = function(index, defaults) {
      var self = this, $iter = TMP_8._p, block = $iter || nil;
      TMP_8._p = null;
      
      var original = index;

      if (index < 0) {
        index += self.length;
      }

      if (index >= 0 && index < self.length) {
        return self[index];
      }

      if (block !== nil) {
        return block(original);
      }

      if (defaults != null) {
        return defaults;
      }

      if (self.length === 0) {
        self.$raise($opalScope.IndexError, "index " + (original) + " outside of array bounds: 0...0")
      }
      else {
        self.$raise($opalScope.IndexError, "index " + (original) + " outside of array bounds: -" + (self.length) + "..." + (self.length));
      }
    ;
    };

    def.$fill = TMP_9 = function(args) {
      var $a, self = this, $iter = TMP_9._p, block = $iter || nil, one = nil, two = nil, obj = nil, left = nil, right = nil;
      args = $slice.call(arguments, 0);
      TMP_9._p = null;
      if (block !== false && block !== nil) {
        if (($a = args.length > 2) !== false && $a !== nil) {
          self.$raise($opalScope.ArgumentError, "wrong number of arguments (" + (args.$length()) + " for 0..2)")};
        $a = $opal.to_ary(args), one = ($a[0] == null ? nil : $a[0]), two = ($a[1] == null ? nil : $a[1]);
        } else {
        if (($a = args.length == 0) !== false && $a !== nil) {
          self.$raise($opalScope.ArgumentError, "wrong number of arguments (0 for 1..3)")
        } else if (($a = args.length > 3) !== false && $a !== nil) {
          self.$raise($opalScope.ArgumentError, "wrong number of arguments (" + (args.$length()) + " for 1..3)")};
        $a = $opal.to_ary(args), obj = ($a[0] == null ? nil : $a[0]), one = ($a[1] == null ? nil : $a[1]), two = ($a[2] == null ? nil : $a[2]);
      };
      if (($a = $opalScope.Range['$==='](one)) !== false && $a !== nil) {
        if (two !== false && two !== nil) {
          self.$raise($opalScope.TypeError, "length invalid with range")};
        left = $opalScope.Opal.$coerce_to(one.$begin(), $opalScope.Integer, "to_int");
        if (($a = left < 0) !== false && $a !== nil) {
          left += self.length;};
        if (($a = left < 0) !== false && $a !== nil) {
          self.$raise($opalScope.RangeError, "" + (one.$inspect()) + " out of range")};
        right = $opalScope.Opal.$coerce_to(one.$end(), $opalScope.Integer, "to_int");
        if (($a = right < 0) !== false && $a !== nil) {
          right += self.length;};
        if (($a = one['$exclude_end?']()) === false || $a === nil) {
          right += 1;};
        if (($a = right <= left) !== false && $a !== nil) {
          return self};
      } else if (one !== false && one !== nil) {
        left = $opalScope.Opal.$coerce_to(one, $opalScope.Integer, "to_int");
        if (($a = left < 0) !== false && $a !== nil) {
          left += self.length;};
        if (($a = left < 0) !== false && $a !== nil) {
          left = 0};
        if (two !== false && two !== nil) {
          right = $opalScope.Opal.$coerce_to(two, $opalScope.Integer, "to_int");
          if (($a = right == 0) !== false && $a !== nil) {
            return self};
          right += left;
          } else {
          right = self.length
        };
        } else {
        left = 0;
        right = self.length;
      };
      $opalScope.Opal['$fits_fixnum!'](right);
      $opalScope.Opal['$fits_array!'](right);
      if (($a = left > self.length) !== false && $a !== nil) {
        
        for (var i = self.length; i < right; i++) {
          self[i] = nil;
        }
      ;};
      if (($a = right > self.length) !== false && $a !== nil) {
        self.length = right};
      if (block !== false && block !== nil) {
        
        for (var length = self.length; left < right; left++) {
          var value = block(left);

          if (value === $breaker) {
            return $breaker.$v;
          }

          self[left] = value;
        }
      ;
        } else {
        
        for (var length = self.length; left < right; left++) {
          self[left] = obj;
        }
      ;
      };
      return self;
    };

    def.$first = function(count) {
      var self = this;
      
      if (count != null) {

        if (count < 0) {
          self.$raise($opalScope.ArgumentError);
        }

        return self.slice(0, count);
      }

      return self.length === 0 ? nil : self[0];
    ;
    };

    def.$flatten = function(level) {
      var self = this;
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var item = self[i];

        if ((item)['$respond_to?']("to_ary")) {
          item = (item).$to_ary();

          if (level == null) {
            result.push.apply(result, (item).$flatten().$to_a());
          }
          else if (level == 0) {
            result.push(item);
          }
          else {
            result.push.apply(result, (item).$flatten(level - 1).$to_a());
          }
        }
        else {
          result.push(item);
        }
      }

      return result;
    ;
    };

    def['$flatten!'] = function(level) {
      var self = this;
      
      var flattened = self.$flatten(level);

      if (self.length == flattened.length) {
        for (var i = 0, length = self.length; i < length; i++) {
          if (self[i] !== flattened[i]) {
            break;
          }
        }

        if (i == length) {
          return nil;
        }
      }

      self.$replace(flattened);
    ;
      return self;
    };

    def.$hash = function() {
      var self = this;
      return self._id || (self._id = Opal.uid());
    };

    def['$include?'] = function(member) {
      var self = this;
      
      for (var i = 0, length = self.length; i < length; i++) {
        if ((self[i])['$=='](member)) {
          return true;
        }
      }

      return false;
    
    };

    def.$index = TMP_10 = function(object) {
      var self = this, $iter = TMP_10._p, block = $iter || nil;
      TMP_10._p = null;
      
      if (object != null) {
        for (var i = 0, length = self.length; i < length; i++) {
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (var i = 0, length = self.length, value; i < length; i++) {
          if ((value = block(self[i])) === $breaker) {
            return $breaker.$v;
          }

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else {
        return self.$enum_for("index");
      }

      return nil;
    
    };

    def.$insert = function(index, objects) {
      var self = this;
      objects = $slice.call(arguments, 1);
      
      if (objects.length > 0) {
        if (index < 0) {
          index += self.length + 1;

          if (index < 0) {
            self.$raise($opalScope.IndexError, "" + (index) + " is out of bounds");
          }
        }
        if (index > self.length) {
          for (var i = self.length; i < index; i++) {
            self.push(nil);
          }
        }

        self.splice.apply(self, [index, 0].concat(objects));
      }
    
      return self;
    };

    def.$inspect = function() {
      var self = this;
      
      var i, inspect, el, el_insp, length, object_id;

      inspect = [];
      object_id = self.$object_id();
      length = self.length;

      for (i = 0; i < length; i++) {
        el = self['$[]'](i);

        // Check object_id to ensure it's not the same array get into an infinite loop
        el_insp = (el).$object_id() === object_id ? '[...]' : (el).$inspect();

        inspect.push(el_insp);
      }
      return '[' + inspect.join(', ') + ']';
    ;
    };

    def.$join = function(sep) {
      var self = this;
      if (sep == null) {
        sep = ""
      }
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        result.push((self[i]).$to_s());
      }

      return result.join(sep);
    
    };

    def.$keep_if = TMP_11 = function() {
      var self = this, $iter = TMP_11._p, block = $iter || nil;
      TMP_11._p = null;
      if (block === nil) {
        return self.$enum_for("keep_if")};
      
      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          self.splice(i, 1);

          length--;
          i--;
        }
      }
    
      return self;
    };

    def.$last = function(count) {
      var self = this;
      
      var length = self.length;

      if (count === nil || typeof(count) == 'string') {
        self.$raise($opalScope.TypeError, "no implicit conversion to integer");
      }

      if (typeof(count) == 'object') {
        if (count['$respond_to?']("to_int")) {
          count = count['$to_int']();
        }
        else {
          self.$raise($opalScope.TypeError, "no implicit conversion to integer");
        }
      }

      if (count == null) {
        return length === 0 ? nil : self[length - 1];
      }
      else if (count < 0) {
        self.$raise($opalScope.ArgumentError, "negative count given");
      }

      if (count > length) {
        count = length;
      }

      return self.slice(length - count, length);
    
    };

    def.$length = function() {
      var self = this;
      return self.length;
    };

    $opal.defn(self, '$map', def.$collect);

    $opal.defn(self, '$map!', def['$collect!']);

    def.$pop = function(count) {
      var self = this;
      
      var length = self.length;

      if (count == null) {
        return length === 0 ? nil : self.pop();
      }

      if (count < 0) {
        self.$raise($opalScope.ArgumentError, "negative count given");
      }

      return count > length ? self.splice(0, self.length) : self.splice(length - count, length);
    
    };

    def.$push = function(objects) {
      var self = this;
      objects = $slice.call(arguments, 0);
      
      for (var i = 0, length = objects.length; i < length; i++) {
        self.push(objects[i]);
      }
    
      return self;
    };

    def.$rassoc = function(object) {
      var self = this;
      
      for (var i = 0, length = self.length, item; i < length; i++) {
        item = self[i];

        if (item.length && item[1] !== undefined) {
          if ((item[1])['$=='](object)) {
            return item;
          }
        }
      }

      return nil;
    
    };

    def.$reject = TMP_12 = function() {
      var self = this, $iter = TMP_12._p, block = $iter || nil;
      TMP_12._p = null;
      if (block === nil) {
        return self.$enum_for("reject")};
      
      var result = [];

      for (var i = 0, length = self.length, value; i < length; i++) {
        if ((value = block(self[i])) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          result.push(self[i]);
        }
      }
      return result;
    
    };

    def['$reject!'] = TMP_13 = function() {
      var $a, $b, self = this, $iter = TMP_13._p, block = $iter || nil;
      TMP_13._p = null;
      if (block === nil) {
        return self.$enum_for("reject!")};
      
      var original = self.length;
      ($a = ($b = self).$delete_if, $a._p = block.$to_proc(), $a).call($b);
      return self.length === original ? nil : self;
    
    };

    def.$replace = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](other)) !== false && $a !== nil) {
        other = other.$to_a()
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Array, "to_ary").$to_a()
      };
      
      self.splice(0, self.length);
      self.push.apply(self, other);
    
      return self;
    };

    def.$reverse = function() {
      var self = this;
      return self.slice(0).reverse();
    };

    def['$reverse!'] = function() {
      var self = this;
      return self.reverse();
    };

    def.$reverse_each = TMP_14 = function() {
      var $a, $b, self = this, $iter = TMP_14._p, block = $iter || nil;
      TMP_14._p = null;
      if (block === nil) {
        return self.$enum_for("reverse_each")};
      ($a = ($b = self.$reverse()).$each, $a._p = block.$to_proc(), $a).call($b);
      return self;
    };

    def.$rindex = TMP_15 = function(object) {
      var self = this, $iter = TMP_15._p, block = $iter || nil;
      TMP_15._p = null;
      
      if (object != null) {
        for (var i = self.length - 1; i >= 0; i--) {
          if ((self[i])['$=='](object)) {
            return i;
          }
        }
      }
      else if (block !== nil) {
        for (var i = self.length - 1, value; i >= 0; i--) {
          if ((value = block(self[i])) === $breaker) {
            return $breaker.$v;
          }

          if (value !== false && value !== nil) {
            return i;
          }
        }
      }
      else if (object == null) {
        return self.$enum_for("rindex");
      }

      return nil;
    
    };

    def.$sample = function(n) {
      var $a, $b, $c, TMP_16, self = this;
      if (n == null) {
        n = nil
      }
      if (($a = ($b = ($c = n, ($c === nil || $c === false)), $b !== false && $b !== nil ?self['$empty?']() : $b)) !== false && $a !== nil) {
        return nil};
      if (($a = (($b = n !== false && n !== nil) ? self['$empty?']() : $b)) !== false && $a !== nil) {
        return []};
      if (n !== false && n !== nil) {
        return ($a = ($b = ($range(1, n, false))).$map, $a._p = (TMP_16 = function(){var self = TMP_16._s || this;
        return self['$[]'](self.$rand(self.$length()))}, TMP_16._s = self, TMP_16), $a).call($b)
        } else {
        return self['$[]'](self.$rand(self.$length()))
      };
    };

    def.$select = TMP_17 = function() {
      var self = this, $iter = TMP_17._p, block = $iter || nil;
      TMP_17._p = null;
      if (block === nil) {
        return self.$enum_for("select")};
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        if ((value = $opal.$yield1(block, item)) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          result.push(item);
        }
      }

      return result;
    
    };

    def['$select!'] = TMP_18 = function() {
      var $a, $b, self = this, $iter = TMP_18._p, block = $iter || nil;
      TMP_18._p = null;
      if (block === nil) {
        return self.$enum_for("select!")};
      
      var original = self.length;
      ($a = ($b = self).$keep_if, $a._p = block.$to_proc(), $a).call($b);
      return self.length === original ? nil : self;
    
    };

    def.$shift = function(count) {
      var self = this;
      
      if (self.length === 0) {
        return nil;
      }

      return count == null ? self.shift() : self.splice(0, count)
    
    };

    $opal.defn(self, '$size', def.$length);

    def.$shuffle = function() {
      var self = this;
      return self.$clone()['$shuffle!']();
    };

    def['$shuffle!'] = function() {
      var self = this;
      
      for (var i = self.length - 1; i > 0; i--) {
        var tmp = self[i],
            j   = Math.floor(Math.random() * (i + 1));

        self[i] = self[j];
        self[j] = tmp;
      }
    
      return self;
    };

    $opal.defn(self, '$slice', def['$[]']);

    def['$slice!'] = function(index, length) {
      var self = this;
      
      if (index < 0) {
        index += self.length;
      }

      if (length != null) {
        return self.splice(index, length);
      }

      if (index < 0 || index >= self.length) {
        return nil;
      }

      return self.splice(index, 1)[0];
    
    };

    def.$sort = TMP_19 = function() {
      var $a, self = this, $iter = TMP_19._p, block = $iter || nil;
      TMP_19._p = null;
      if (($a = self.length > 1) === false || $a === nil) {
        return self};
      
      if (!(block !== nil)) {
        block = function(a, b) {
          return (a)['$<=>'](b);
        };
      }

      try {
        return self.slice().sort(function(x, y) {
          var ret = block(x, y);

          if (ret === $breaker) {
            throw $breaker;
          }
          else if (ret === nil) {
            self.$raise($opalScope.ArgumentError, "comparison of " + ((x).$inspect()) + " with " + ((y).$inspect()) + " failed");
          }

          return (ret)['$>'](0) ? 1 : ((ret)['$<'](0) ? -1 : 0);
        });
      }
      catch (e) {
        if (e === $breaker) {
          return $breaker.$v;
        }
        else {
          throw e;
        }
      }
    ;
    };

    def['$sort!'] = TMP_20 = function() {
      var $a, $b, self = this, $iter = TMP_20._p, block = $iter || nil;
      TMP_20._p = null;
      
      var result;

      if ((block !== nil)) {
        result = ($a = ($b = (self.slice())).$sort, $a._p = block.$to_proc(), $a).call($b);
      }
      else {
        result = (self.slice()).$sort();
      }

      self.length = 0;
      for(var i = 0, length = result.length; i < length; i++) {
        self.push(result[i]);
      }

      return self;
    ;
    };

    def.$take = function(count) {
      var self = this;
      
      if (count < 0) {
        self.$raise($opalScope.ArgumentError);
      }

      return self.slice(0, count);
    ;
    };

    def.$take_while = TMP_21 = function() {
      var self = this, $iter = TMP_21._p, block = $iter || nil;
      TMP_21._p = null;
      
      var result = [];

      for (var i = 0, length = self.length, item, value; i < length; i++) {
        item = self[i];

        if ((value = block(item)) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          return result;
        }

        result.push(item);
      }

      return result;
    
    };

    def.$to_a = function() {
      var self = this;
      return self;
    };

    $opal.defn(self, '$to_ary', def.$to_a);

    $opal.defn(self, '$to_s', def.$inspect);

    def.$transpose = function() {
      var $a, $b, TMP_22, self = this, result = nil, max = nil;
      if (($a = self['$empty?']()) !== false && $a !== nil) {
        return []};
      result = [];
      max = nil;
      ($a = ($b = self).$each, $a._p = (TMP_22 = function(row){var self = TMP_22._s || this, $a, $b, TMP_23;if (row == null) row = nil;
      if (($a = $opalScope.Array['$==='](row)) !== false && $a !== nil) {
          row = row.$to_a()
          } else {
          row = $opalScope.Opal.$coerce_to(row, $opalScope.Array, "to_ary").$to_a()
        };
        ((($a = max) !== false && $a !== nil) ? $a : max = row.length);
        if (($a = ($b = (row.length)['$=='](max), ($b === nil || $b === false))) !== false && $a !== nil) {
          self.$raise($opalScope.IndexError, "element size differs (" + (row.length) + " should be " + (max))};
        return ($a = ($b = (row.length)).$times, $a._p = (TMP_23 = function(i){var self = TMP_23._s || this, $a, $b, $c, entry = nil;if (i == null) i = nil;
        entry = (($a = i, $b = result, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))));
          return entry['$<<'](row.$at(i));}, TMP_23._s = self, TMP_23), $a).call($b);}, TMP_22._s = self, TMP_22), $a).call($b);
      return result;
    };

    def.$uniq = function() {
      var self = this;
      
      var result = [],
          seen   = {};

      for (var i = 0, length = self.length, item, hash; i < length; i++) {
        item = self[i];
        hash = item;

        if (!seen[hash]) {
          seen[hash] = true;

          result.push(item);
        }
      }

      return result;
    
    };

    def['$uniq!'] = function() {
      var self = this;
      
      var original = self.length,
          seen     = {};

      for (var i = 0, length = original, item, hash; i < length; i++) {
        item = self[i];
        hash = item;

        if (!seen[hash]) {
          seen[hash] = true;
        }
        else {
          self.splice(i, 1);

          length--;
          i--;
        }
      }

      return self.length === original ? nil : self;
    
    };

    def.$unshift = function(objects) {
      var self = this;
      objects = $slice.call(arguments, 0);
      
      for (var i = objects.length - 1; i >= 0; i--) {
        self.unshift(objects[i]);
      }
    
      return self;
    };

    return (def.$zip = TMP_24 = function(others) {
      var self = this, $iter = TMP_24._p, block = $iter || nil;
      others = $slice.call(arguments, 0);
      TMP_24._p = null;
      
      var result = [], size = self.length, part, o;

      for (var i = 0; i < size; i++) {
        part = [self[i]];

        for (var j = 0, jj = others.length; j < jj; j++) {
          o = others[j][i];

          if (o == null) {
            o = nil;
          }

          part[j + 1] = o;
        }

        result[i] = part;
      }

      if (block !== nil) {
        for (var i = 0; i < size; i++) {
          block(result[i]);
        }

        return nil;
      }

      return result;
    
    }, nil);
  })(self, null);
  return (function($base, $super) {
    function $Wrapper(){};
    var self = $Wrapper = $klass($base, $super, 'Wrapper', $Wrapper);

    var def = $Wrapper._proto, $opalScope = $Wrapper._scope, TMP_25, TMP_26, TMP_27, TMP_28, TMP_29;
    def.literal = nil;
    $opal.defs(self, '$allocate', TMP_25 = function(array) {
      var self = this, $iter = TMP_25._p, $yield = $iter || nil, obj = nil;
      if (array == null) {
        array = []
      }
      TMP_25._p = null;
      obj = $opal.find_super_dispatcher(self, 'allocate', TMP_25, null, $Wrapper).apply(self, []);
      obj.literal = array;
      return obj;
    });

    $opal.defs(self, '$new', TMP_26 = function(args) {
      var $a, $b, self = this, $iter = TMP_26._p, block = $iter || nil, obj = nil;
      args = $slice.call(arguments, 0);
      TMP_26._p = null;
      obj = self.$allocate();
      ($a = ($b = obj).$initialize, $a._p = block.$to_proc(), $a).apply($b, [].concat(args));
      return obj;
    });

    $opal.defs(self, '$[]', function(objects) {
      var self = this;
      objects = $slice.call(arguments, 0);
      return self.$allocate(objects);
    });

    def.$initialize = TMP_27 = function(args) {
      var $a, $b, self = this, $iter = TMP_27._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_27._p = null;
      return self.literal = ($a = ($b = $opalScope.Array).$new, $a._p = block.$to_proc(), $a).apply($b, [].concat(args));
    };

    def.$method_missing = TMP_28 = function(args) {
      var $a, $b, self = this, $iter = TMP_28._p, block = $iter || nil, result = nil;
      args = $slice.call(arguments, 0);
      TMP_28._p = null;
      result = ($a = ($b = self.literal).$__send__, $a._p = block.$to_proc(), $a).apply($b, [].concat(args));
      if (($a = result === self.literal) !== false && $a !== nil) {
        return self
        } else {
        return result
      };
    };

    def.$initialize_copy = function(other) {
      var self = this;
      return self.literal = (other.literal).$clone();
    };

    def['$respond_to?'] = TMP_29 = function(name) {var $zuper = $slice.call(arguments, 0);
      var $a, self = this, $iter = TMP_29._p, $yield = $iter || nil;
      TMP_29._p = null;
      return ((($a = $opal.find_super_dispatcher(self, 'respond_to?', TMP_29, $iter).apply(self, $zuper)) !== false && $a !== nil) ? $a : self.literal['$respond_to?'](name));
    };

    def['$=='] = function(other) {
      var self = this;
      return self.literal['$=='](other);
    };

    def['$eql?'] = function(other) {
      var self = this;
      return self.literal['$eql?'](other);
    };

    def.$to_a = function() {
      var self = this;
      return self.literal;
    };

    def.$to_ary = function() {
      var self = this;
      return self;
    };

    def.$inspect = function() {
      var self = this;
      return self.literal.$inspect();
    };

    def['$*'] = function(other) {
      var self = this;
      
      var result = self.literal['$*'](other);

      if (result._isArray) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    };

    def['$[]'] = function(index, length) {
      var self = this;
      
      var result = self.literal.$slice(index, length);

      if (result._isArray && (index._isRange || length !== undefined)) {
        return self.$class().$allocate(result)
      }
      else {
        return result;
      }
    ;
    };

    $opal.defn(self, '$slice', def['$[]']);

    def.$uniq = function() {
      var self = this;
      return self.$class().$allocate(self.literal.$uniq());
    };

    return (def.$flatten = function(level) {
      var self = this;
      return self.$class().$allocate(self.literal.$flatten(level));
    }, nil);
  })($opalScope.Array, null);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = $Hash._proto, $opalScope = $Hash._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6, TMP_7, TMP_8, TMP_9, TMP_10, TMP_11, TMP_12;
    def.proc = def.none = nil;
    self.$include($opalScope.Enumerable);

    var $hasOwn = {}.hasOwnProperty;

    $opal.defs(self, '$[]', function(objs) {
      var self = this;
      objs = $slice.call(arguments, 0);
      return $opal.hash.apply(null, objs);
    });

    $opal.defs(self, '$allocate', function() {
      var self = this;
      
      var hash = new self._alloc;

      hash.map  = {};
      hash.keys = [];

      return hash;
    
    });

    def.$initialize = TMP_1 = function(defaults) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      
      if (defaults != null) {
        self.none = defaults;
      }
      else if (block !== nil) {
        self.proc = block;
      }

      return self;
    
    };

    def['$=='] = function(other) {
      var $a, self = this;
      
      if (self === other) {
        return true;
      }

      if (!other.map || !other.keys) {
        return false;
      }

      if (self.keys.length !== other.keys.length) {
        return false;
      }

      var map  = self.map,
          map2 = other.map;

      for (var i = 0, length = self.keys.length; i < length; i++) {
        var key = self.keys[i], obj = map[key], obj2 = map2[key];

        if (($a = (obj)['$=='](obj2), ($a === nil || $a === false))) {
          return false;
        }
      }

      return true;
    
    };

    def['$[]'] = function(key) {
      var self = this;
      
      var map = self.map;

      if ($hasOwn.call(map, key)) {
        return map[key];
      }

      var proc = self.proc;

      if (proc !== nil) {
        return (proc).$call(self, key);
      }

      return self.none;
    
    };

    def['$[]='] = function(key, value) {
      var self = this;
      
      var map = self.map;

      if (!$hasOwn.call(map, key)) {
        self.keys.push(key);
      }

      map[key] = value;

      return value;
    
    };

    def.$assoc = function(object) {
      var self = this;
      
      var keys = self.keys, key;

      for (var i = 0, length = keys.length; i < length; i++) {
        key = keys[i];

        if ((key)['$=='](object)) {
          return [key, self.map[key]];
        }
      }

      return nil;
    
    };

    def.$clear = function() {
      var self = this;
      
      self.map = {};
      self.keys = [];
      return self;
    
    };

    def.$clone = function() {
      var self = this;
      
      var map  = {},
          keys = [];

      for (var i = 0, length = self.keys.length; i < length; i++) {
        var key   = self.keys[i],
            value = self.map[key];

        keys.push(key);
        map[key] = value;
      }

      var hash = new self._klass._alloc();

      hash.map  = map;
      hash.keys = keys;
      hash.none = self.none;
      hash.proc = self.proc;

      return hash;
    
    };

    def.$default = function(val) {
      var self = this;
      return self.none;
    };

    def['$default='] = function(object) {
      var self = this;
      return self.none = object;
    };

    def.$default_proc = function() {
      var self = this;
      return self.proc;
    };

    def['$default_proc='] = function(proc) {
      var self = this;
      return self.proc = proc;
    };

    def.$delete = function(key) {
      var self = this;
      
      var map  = self.map, result = map[key];

      if (result != null) {
        delete map[key];
        self.keys.$delete(key);

        return result;
      }

      return nil;
    
    };

    def.$delete_if = TMP_2 = function() {
      var $a, self = this, $iter = TMP_2._p, block = $iter || nil;
      TMP_2._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("delete_if")};
      
      var map = self.map, keys = self.keys, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
        }
      }

      return self;
    
    };

    $opal.defn(self, '$dup', def.$clone);

    def.$each = TMP_3 = function() {
      var $a, self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("each")};
      
      var map  = self.map,
          keys = self.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key   = keys[i],
            value = $opal.$yield1(block, [key, map[key]]);

        if (value === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    };

    def.$each_key = TMP_4 = function() {
      var $a, self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("each_key")};
      
      var keys = self.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        if (block(key) === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    };

    $opal.defn(self, '$each_pair', def.$each);

    def.$each_value = TMP_5 = function() {
      var $a, self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("each_value")};
      
      var map = self.map, keys = self.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        if (block(map[keys[i]]) === $breaker) {
          return $breaker.$v;
        }
      }

      return self;
    
    };

    def['$empty?'] = function() {
      var self = this;
      return self.keys.length === 0;
    };

    $opal.defn(self, '$eql?', def['$==']);

    def.$fetch = TMP_6 = function(key, defaults) {
      var self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      
      var value = self.map[key];

      if (value != null) {
        return value;
      }

      if (block !== nil) {
        var value;

        if ((value = block(key)) === $breaker) {
          return $breaker.$v;
        }

        return value;
      }

      if (defaults != null) {
        return defaults;
      }

      self.$raise($opalScope.KeyError, "key not found");
    
    };

    def.$flatten = function(level) {
      var self = this;
      
      var map = self.map, keys = self.keys, result = [];

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], value = map[key];

        result.push(key);

        if (value._isArray) {
          if (level == null || level === 1) {
            result.push(value);
          }
          else {
            result = result.concat((value).$flatten(level - 1));
          }
        }
        else {
          result.push(value);
        }
      }

      return result;
    
    };

    def['$has_key?'] = function(key) {
      var self = this;
      return $hasOwn.call(self.map, key);
    };

    def['$has_value?'] = function(value) {
      var self = this;
      
      for (var assoc in self.map) {
        if ((self.map[assoc])['$=='](value)) {
          return true;
        }
      }

      return false;
    ;
    };

    def.$hash = function() {
      var self = this;
      return self._id;
    };

    $opal.defn(self, '$include?', def['$has_key?']);

    def.$index = function(object) {
      var self = this;
      
      var map = self.map, keys = self.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        if ((map[key])['$=='](object)) {
          return key;
        }
      }

      return nil;
    
    };

    def.$indexes = function(keys) {
      var self = this;
      keys = $slice.call(arguments, 0);
      
      var result = [], map = self.map, val;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], val = map[key];

        if (val != null) {
          result.push(val);
        }
        else {
          result.push(self.none);
        }
      }

      return result;
    
    };

    $opal.defn(self, '$indices', def.$indexes);

    def.$inspect = function() {
      var self = this;
      
      var inspect = [], keys = self.keys, map = self.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], val = map[key];

        if (val === self) {
          inspect.push((key).$inspect() + '=>' + '{...}');
        } else {
          inspect.push((key).$inspect() + '=>' + (map[key]).$inspect());
        }
      }

      return '{' + inspect.join(', ') + '}';
    ;
    };

    def.$invert = function() {
      var self = this;
      
      var result = $opal.hash(), keys = self.keys, map = self.map,
          keys2 = result.keys, map2 = result.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        keys2.push(obj);
        map2[obj] = key;
      }

      return result;
    
    };

    def.$keep_if = TMP_7 = function() {
      var $a, self = this, $iter = TMP_7._p, block = $iter || nil;
      TMP_7._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("keep_if")};
      
      var map = self.map, keys = self.keys, value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
        }
      }

      return self;
    
    };

    $opal.defn(self, '$key', def.$index);

    $opal.defn(self, '$key?', def['$has_key?']);

    def.$keys = function() {
      var self = this;
      return self.keys.slice(0);
    };

    def.$length = function() {
      var self = this;
      return self.keys.length;
    };

    $opal.defn(self, '$member?', def['$has_key?']);

    def.$merge = TMP_8 = function(other) {
      var self = this, $iter = TMP_8._p, block = $iter || nil;
      TMP_8._p = null;
      
      var keys = self.keys, map = self.map,
          result = $opal.hash(), keys2 = result.keys, map2 = result.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];

        keys2.push(key);
        map2[key] = map[key];
      }

      var keys = other.keys, map = other.map;

      if (block === nil) {
        for (var i = 0, length = keys.length; i < length; i++) {
          var key = keys[i];

          if (map2[key] == null) {
            keys2.push(key);
          }

          map2[key] = map[key];
        }
      }
      else {
        for (var i = 0, length = keys.length; i < length; i++) {
          var key = keys[i];

          if (map2[key] == null) {
            keys2.push(key);
            map2[key] = map[key];
          }
          else {
            map2[key] = block(key, map2[key], map[key]);
          }
        }
      }

      return result;
    
    };

    def['$merge!'] = TMP_9 = function(other) {
      var self = this, $iter = TMP_9._p, block = $iter || nil;
      TMP_9._p = null;
      
      var keys = self.keys, map = self.map,
          keys2 = other.keys, map2 = other.map;

      if (block === nil) {
        for (var i = 0, length = keys2.length; i < length; i++) {
          var key = keys2[i];

          if (map[key] == null) {
            keys.push(key);
          }

          map[key] = map2[key];
        }
      }
      else {
        for (var i = 0, length = keys2.length; i < length; i++) {
          var key = keys2[i];

          if (map[key] == null) {
            keys.push(key);
            map[key] = map2[key];
          }
          else {
            map[key] = block(key, map[key], map2[key]);
          }
        }
      }

      return self;
    
    };

    def.$rassoc = function(object) {
      var self = this;
      
      var keys = self.keys, map = self.map;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((obj)['$=='](object)) {
          return [key, obj];
        }
      }

      return nil;
    
    };

    def.$reject = TMP_10 = function() {
      var $a, self = this, $iter = TMP_10._p, block = $iter || nil;
      TMP_10._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("reject")};
      
      var keys = self.keys, map = self.map,
          result = $opal.hash(), map2 = result.map, keys2 = result.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key], value;

        if ((value = block(key, obj)) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          keys2.push(key);
          map2[key] = obj;
        }
      }

      return result;
    
    };

    def.$replace = function(other) {
      var self = this;
      
      var map = self.map = {}, keys = self.keys = [];

      for (var i = 0, length = other.keys.length; i < length; i++) {
        var key = other.keys[i];
        keys.push(key);
        map[key] = other.map[key];
      }

      return self;
    
    };

    def.$select = TMP_11 = function() {
      var $a, self = this, $iter = TMP_11._p, block = $iter || nil;
      TMP_11._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("select")};
      
      var keys = self.keys, map = self.map,
          result = $opal.hash(), map2 = result.map, keys2 = result.keys;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key], value;

        if ((value = block(key, obj)) === $breaker) {
          return $breaker.$v;
        }

        if (value !== false && value !== nil) {
          keys2.push(key);
          map2[key] = obj;
        }
      }

      return result;
    
    };

    def['$select!'] = TMP_12 = function() {
      var $a, self = this, $iter = TMP_12._p, block = $iter || nil;
      TMP_12._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("select!")};
      
      var map = self.map, keys = self.keys, value, result = nil;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i], obj = map[key];

        if ((value = block(key, obj)) === $breaker) {
          return $breaker.$v;
        }

        if (value === false || value === nil) {
          keys.splice(i, 1);
          delete map[key];

          length--;
          i--;
          result = self
        }
      }

      return result;
    
    };

    def.$shift = function() {
      var self = this;
      
      var keys = self.keys, map = self.map;

      if (keys.length) {
        var key = keys[0], obj = map[key];

        delete map[key];
        keys.splice(0, 1);

        return [key, obj];
      }

      return nil;
    
    };

    $opal.defn(self, '$size', def.$length);

    self.$alias_method("store", "[]=");

    def.$to_a = function() {
      var self = this;
      
      var keys = self.keys, map = self.map, result = [];

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i];
        result.push([key, map[key]]);
      }

      return result;
    
    };

    def.$to_h = function() {
      var self = this;
      
      var hash   = new Opal.Hash._alloc,
          cloned = self.$clone();

      hash.map  = cloned.map;
      hash.keys = cloned.keys;
      hash.none = cloned.none;
      hash.proc = cloned.proc;

      return hash;
    ;
    };

    def.$to_hash = function() {
      var self = this;
      return self;
    };

    $opal.defn(self, '$to_s', def.$inspect);

    $opal.defn(self, '$update', def['$merge!']);

    $opal.defn(self, '$value?', def['$has_value?']);

    $opal.defn(self, '$values_at', def.$indexes);

    return (def.$values = function() {
      var self = this;
      
      var map    = self.map,
          result = [];

      for (var key in map) {
        result.push(map[key]);
      }

      return result;
    
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $gvars = $opal.gvars;
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = $String._proto, $opalScope = $String._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5, TMP_6;
    def.length = nil;
    self.$include($opalScope.Comparable);

    def._isString = true;

    $opal.defs(self, '$try_convert', function(what) {
      var self = this;
      try {
      return what.$to_str()
      } catch ($err) {if (true) {
        return nil
        }else { throw $err; }
      };
    });

    $opal.defs(self, '$new', function(str) {
      var self = this;
      if (str == null) {
        str = ""
      }
      return new String(str);
    });

    def['$%'] = function(data) {
      var $a, self = this;
      if (($a = $opalScope.Array['$==='](data)) !== false && $a !== nil) {
        return ($a = self).$format.apply($a, [self].concat(data))
        } else {
        return self.$format(self, data)
      };
    };

    def['$*'] = function(count) {
      var self = this;
      
      if (count < 1) {
        return '';
      }

      var result  = '',
          pattern = self;

      while (count > 0) {
        if (count & 1) {
          result += pattern;
        }

        count >>= 1;
        pattern += pattern;
      }

      return result;
    
    };

    def['$+'] = function(other) {
      var self = this;
      other = $opalScope.Opal.$coerce_to(other, $opalScope.String, "to_str");
      return self + other.$to_s();
    };

    def['$<=>'] = function(other) {
      var $a, self = this;
      if (($a = other['$respond_to?']("to_str")) !== false && $a !== nil) {
        other = other.$to_str().$to_s();
        return self > other ? 1 : (self < other ? -1 : 0);
        } else {
        
        var cmp = other['$<=>'](self);

        if (cmp === nil) {
          return nil;
        }
        else {
          return cmp > 0 ? -1 : (cmp < 0 ? 1 : 0);
        }
      ;
      };
    };

    def['$=='] = function(other) {
      var self = this;
      return !!(other._isString && self.valueOf() === other.valueOf());
    };

    $opal.defn(self, '$===', def['$==']);

    def['$=~'] = function(other) {
      var self = this;
      
      if (other._isString) {
        self.$raise($opalScope.TypeError, "type mismatch: String given");
      }

      return other['$=~'](self);
    ;
    };

    def['$[]'] = function(index, length) {
      var self = this;
      
      var size = self.length;

      if (index._isRange) {
        var exclude = index.exclude,
            length  = index.end,
            index   = index.begin;

        if (index < 0) {
          index += size;
        }

        if (length < 0) {
          length += size;
        }

        if (!exclude) {
          length += 1;
        }

        if (index > size) {
          return nil;
        }

        length = length - index;

        if (length < 0) {
          length = 0;
        }

        return self.substr(index, length);
      }

      if (index < 0) {
        index += self.length;
      }

      if (length == null) {
        if (index >= self.length || index < 0) {
          return nil;
        }

        return self.substr(index, 1);
      }

      if (index > self.length || index < 0) {
        return nil;
      }

      return self.substr(index, length);
    
    };

    def.$capitalize = function() {
      var self = this;
      return self.charAt(0).toUpperCase() + self.substr(1).toLowerCase();
    };

    def.$casecmp = function(other) {
      var self = this;
      other = $opalScope.Opal.$coerce_to(other, $opalScope.String, "to_str").$to_s();
      return (self.toLowerCase())['$<=>'](other.toLowerCase());
    };

    def.$center = function(width, padstr) {
      var $a, self = this;
      if (padstr == null) {
        padstr = " "
      }
      width = $opalScope.Opal.$coerce_to(width, $opalScope.Integer, "to_int");
      padstr = $opalScope.Opal.$coerce_to(padstr, $opalScope.String, "to_str").$to_s();
      if (($a = padstr['$empty?']()) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "zero width padding")};
      if (($a = width <= self.length) !== false && $a !== nil) {
        return self};
      
      var ljustified = self.$ljust((width['$+'](self.length))['$/'](2).$ceil(), padstr),
          rjustified = self.$rjust((width['$+'](self.length))['$/'](2).$floor(), padstr);

      return rjustified + ljustified.slice(self.length);
    ;
    };

    def.$chars = function() {
      var self = this;
      return self.$each_char().$to_a();
    };

    def.$chomp = function(separator) {
      var $a, self = this;
      if (separator == null) {
        separator = $gvars["/"]
      }
      if (($a = separator === nil || self.length === 0) !== false && $a !== nil) {
        return self};
      separator = $opalScope.Opal['$coerce_to!'](separator, $opalScope.String, "to_str").$to_s();
      
      if (separator === "\n") {
        return self.replace(/\r?\n?$/, '');
      }
      else if (separator === "") {
        return self.replace(/(\r?\n)+$/, '');
      }
      else if (self.length > separator.length) {
        var tail = self.substr(-1 * separator.length);

        if (tail === separator) {
          return self.substr(0, self.length - separator.length);
        }
      }
    
      return self;
    };

    def.$chop = function() {
      var self = this;
      
      var length = self.length;

      if (length <= 1) {
        return "";
      }

      if (self.charAt(length - 1) === "\n" && self.charAt(length - 2) === "\r") {
        return self.substr(0, length - 2);
      }
      else {
        return self.substr(0, length - 1);
      }
    
    };

    def.$chr = function() {
      var self = this;
      return self.charAt(0);
    };

    def.$clone = function() {
      var self = this;
      return self.slice();
    };

    def.$count = function(str) {
      var self = this;
      return (self.length - self.replace(new RegExp(str, 'g'), '').length) / str.length;
    };

    $opal.defn(self, '$dup', def.$clone);

    def.$downcase = function() {
      var self = this;
      return self.toLowerCase();
    };

    def.$each_char = TMP_1 = function() {
      var $a, self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      if (block === nil) {
        return self.$enum_for("each_char")};
      
      for (var i = 0, length = self.length; i < length; i++) {
        ((($a = $opal.$yield1(block, self.charAt(i))) === $breaker) ? $breaker.$v : $a);
      }
    
      return self;
    };

    def.$each_line = TMP_2 = function(separator) {
      var $a, self = this, $iter = TMP_2._p, $yield = $iter || nil;
      if (separator == null) {
        separator = $gvars["/"]
      }
      TMP_2._p = null;
      if ($yield === nil) {
        return self.$split(separator)};
      
      var chomped  = self.$chomp(),
          trailing = self.length != chomped.length,
          splitted = chomped.split(separator);

      for (var i = 0, length = splitted.length; i < length; i++) {
        if (i < length - 1 || trailing) {
          ((($a = $opal.$yield1($yield, splitted[i] + separator)) === $breaker) ? $breaker.$v : $a);
        }
        else {
          ((($a = $opal.$yield1($yield, splitted[i])) === $breaker) ? $breaker.$v : $a);
        }
      }
    ;
      return self;
    };

    def['$empty?'] = function() {
      var self = this;
      return self.length === 0;
    };

    def['$end_with?'] = function(suffixes) {
      var self = this;
      suffixes = $slice.call(arguments, 0);
      
      for (var i = 0, length = suffixes.length; i < length; i++) {
        var suffix = $opalScope.Opal.$coerce_to(suffixes[i], $opalScope.String, "to_str");

        if (self.length >= suffix.length && self.substr(0 - suffix.length) === suffix) {
          return true;
        }
      }
    
      return false;
    };

    $opal.defn(self, '$eql?', def['$==']);

    $opal.defn(self, '$equal?', def['$===']);

    def.$gsub = TMP_3 = function(pattern, replace) {
      var $a, $b, self = this, $iter = TMP_3._p, block = $iter || nil;
      TMP_3._p = null;
      if (($a = ((($b = $opalScope.String['$==='](pattern)) !== false && $b !== nil) ? $b : pattern['$respond_to?']("to_str"))) !== false && $a !== nil) {
        pattern = (new RegExp("" + $opalScope.Regexp.$escape(pattern.$to_str())))};
      if (($a = $opalScope.Regexp['$==='](pattern)) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "wrong argument type " + (pattern.$class()) + " (expected Regexp)")};
      
      var pattern = pattern.toString(),
          options = pattern.substr(pattern.lastIndexOf('/') + 1) + 'g',
          regexp  = pattern.substr(1, pattern.lastIndexOf('/') - 1);

      self.$sub._p = block;
      return self.$sub(new RegExp(regexp, options), replace);
    
    };

    def.$hash = function() {
      var self = this;
      return self.toString();
    };

    def.$hex = function() {
      var self = this;
      return self.$to_i(16);
    };

    def['$include?'] = function(other) {
      var $a, self = this;
      
      if (other._isString) {
        return self.indexOf(other) !== -1;
      }
    
      if (($a = other['$respond_to?']("to_str")) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "no implicit conversion of " + (other.$class().$name()) + " into String")};
      return self.indexOf(other.$to_str()) !== -1;
    };

    def.$index = function(what, offset) {
      var $a, $b, self = this, result = nil;
      if (offset == null) {
        offset = nil
      }
      if (($a = $opalScope.String['$==='](what)) !== false && $a !== nil) {
        what = what.$to_s()
      } else if (($a = what['$respond_to?']("to_str")) !== false && $a !== nil) {
        what = what.$to_str().$to_s()
      } else if (($a = ($b = $opalScope.Regexp['$==='](what), ($b === nil || $b === false))) !== false && $a !== nil) {
        self.$raise($opalScope.TypeError, "type mismatch: " + (what.$class()) + " given")};
      result = -1;
      if (offset !== false && offset !== nil) {
        offset = $opalScope.Opal.$coerce_to(offset, $opalScope.Integer, "to_int");
        
        var size = self.length;

        if (offset < 0) {
          offset = offset + size;
        }

        if (offset > size) {
          return nil;
        }
      
        if (($a = $opalScope.Regexp['$==='](what)) !== false && $a !== nil) {
          result = ((($a = (what['$=~'](self.substr(offset)))) !== false && $a !== nil) ? $a : -1)
          } else {
          result = self.substr(offset).indexOf(what)
        };
        
        if (result !== -1) {
          result += offset;
        }
      
      } else if (($a = $opalScope.Regexp['$==='](what)) !== false && $a !== nil) {
        result = ((($a = (what['$=~'](self))) !== false && $a !== nil) ? $a : -1)
        } else {
        result = self.indexOf(what)
      };
      if (($a = result === -1) !== false && $a !== nil) {
        return nil
        } else {
        return result
      };
    };

    def.$inspect = function() {
      var self = this;
      
      var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
          meta      = {
            '\b': '\\b',
            '\t': '\\t',
            '\n': '\\n',
            '\f': '\\f',
            '\r': '\\r',
            '"' : '\\"',
            '\\': '\\\\'
          };

      escapable.lastIndex = 0;

      return escapable.test(self) ? '"' + self.replace(escapable, function(a) {
        var c = meta[a];

        return typeof c === 'string' ? c :
          '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      }) + '"' : '"' + self + '"';
    
    };

    def.$intern = function() {
      var self = this;
      return self;
    };

    def.$lines = function(separator) {
      var self = this;
      if (separator == null) {
        separator = $gvars["/"]
      }
      return self.$each_line(separator).$to_a();
    };

    def.$length = function() {
      var self = this;
      return self.length;
    };

    def.$ljust = function(width, padstr) {
      var $a, self = this;
      if (padstr == null) {
        padstr = " "
      }
      width = $opalScope.Opal.$coerce_to(width, $opalScope.Integer, "to_int");
      padstr = $opalScope.Opal.$coerce_to(padstr, $opalScope.String, "to_str").$to_s();
      if (($a = padstr['$empty?']()) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "zero width padding")};
      if (($a = width <= self.length) !== false && $a !== nil) {
        return self};
      
      var index  = -1,
          result = "";

      width -= self.length;

      while (++index < width) {
        result += padstr;
      }

      return self + result.slice(0, width);
    
    };

    def.$lstrip = function() {
      var self = this;
      return self.replace(/^\s*/, '');
    };

    def.$match = TMP_4 = function(pattern, pos) {
      var $a, $b, self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (($a = ((($b = $opalScope.String['$==='](pattern)) !== false && $b !== nil) ? $b : pattern['$respond_to?']("to_str"))) !== false && $a !== nil) {
        pattern = (new RegExp("" + $opalScope.Regexp.$escape(pattern.$to_str())))};
      if (($a = $opalScope.Regexp['$==='](pattern)) === false || $a === nil) {
        self.$raise($opalScope.TypeError, "wrong argument type " + (pattern.$class()) + " (expected Regexp)")};
      return ($a = ($b = pattern).$match, $a._p = block.$to_proc(), $a).call($b, self, pos);
    };

    def.$next = function() {
      var self = this;
      
      if (self.length === 0) {
        return "";
      }

      var initial = self.substr(0, self.length - 1);
      var last    = String.fromCharCode(self.charCodeAt(self.length - 1) + 1);

      return initial + last;
    ;
    };

    def.$ord = function() {
      var self = this;
      return self.charCodeAt(0);
    };

    def.$partition = function(str) {
      var self = this;
      
      var result = self.split(str);
      var splitter = (result[0].length === self.length ? "" : str);

      return [result[0], splitter, result.slice(1).join(str.toString())];
    ;
    };

    def.$reverse = function() {
      var self = this;
      return self.split('').reverse().join('');
    };

    def.$rindex = function(search, offset) {
      var self = this;
      
      var search_type = (search == null ? Opal.NilClass : search.constructor);
      if (search_type != String && search_type != RegExp) {
        var msg = "type mismatch: " + search_type + " given";
        self.$raise($opalScope.TypeError.$new(msg));
      }

      if (self.length == 0) {
        return search.length == 0 ? 0 : nil;
      }

      var result = -1;
      if (offset != null) {
        if (offset < 0) {
          offset = self.length + offset;
        }

        if (search_type == String) {
          result = self.lastIndexOf(search, offset);
        }
        else {
          result = self.substr(0, offset + 1).$reverse().search(search);
          if (result !== -1) {
            result = offset - result;
          }
        }
      }
      else {
        if (search_type == String) {
          result = self.lastIndexOf(search);
        }
        else {
          result = self.$reverse().search(search);
          if (result !== -1) {
            result = self.length - 1 - result;
          }
        }
      }

      return result === -1 ? nil : result;
    
    };

    def.$rjust = function(width, padstr) {
      var $a, self = this;
      if (padstr == null) {
        padstr = " "
      }
      width = $opalScope.Opal.$coerce_to(width, $opalScope.Integer, "to_int");
      padstr = $opalScope.Opal.$coerce_to(padstr, $opalScope.String, "to_str").$to_s();
      if (($a = padstr['$empty?']()) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "zero width padding")};
      if (($a = width <= self.length) !== false && $a !== nil) {
        return self};
      
      var chars     = Math.floor(width - self.length),
          patterns  = Math.floor(chars / padstr.length),
          result    = Array(patterns + 1).join(padstr),
          remaining = chars - result.length;

      return result + padstr.slice(0, remaining) + self;
    
    };

    def.$rstrip = function() {
      var self = this;
      return self.replace(/\s*$/, '');
    };

    def.$scan = TMP_5 = function(pattern) {
      var self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      
      if (pattern.global) {
        // should we clear it afterwards too?
        pattern.lastIndex = 0;
      }
      else {
        // rewrite regular expression to add the global flag to capture pre/post match
        pattern = new RegExp(pattern.source, 'g' + (pattern.multiline ? 'm' : '') + (pattern.ignoreCase ? 'i' : ''));
      }

      var result = [];
      var match;

      while ((match = pattern.exec(self)) != null) {
        var match_data = $opalScope.MatchData.$new(pattern, match);
        if (block === nil) {
          match.length == 1 ? result.push(match[0]) : result.push(match.slice(1));
        }
        else {
          match.length == 1 ? block(match[0]) : block.apply(self, match.slice(1));
        }
      }

      return (block !== nil ? self : result);
    ;
    };

    $opal.defn(self, '$size', def.$length);

    $opal.defn(self, '$slice', def['$[]']);

    def.$split = function(pattern, limit) {
      var self = this, $a;
      if (pattern == null) {
        pattern = ((($a = $gvars[";"]) !== false && $a !== nil) ? $a : " ")
      }
      return self.split(pattern, limit);
    };

    def['$start_with?'] = function(prefixes) {
      var self = this;
      prefixes = $slice.call(arguments, 0);
      
      for (var i = 0, length = prefixes.length; i < length; i++) {
        var prefix = $opalScope.Opal.$coerce_to(prefixes[i], $opalScope.String, "to_str");

        if (self.indexOf(prefix) === 0) {
          return true;
        }
      }

      return false;
    
    };

    def.$strip = function() {
      var self = this;
      return self.replace(/^\s*/, '').replace(/\s*$/, '');
    };

    def.$sub = TMP_6 = function(pattern, replace) {
      var self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      
      if (typeof(replace) === 'string') {
        // convert Ruby back reference to JavaScript back reference
        replace = replace.replace(/\\([1-9])/g, '$$$1')
        return self.replace(pattern, replace);
      }
      if (block !== nil) {
        return self.replace(pattern, function() {
          // FIXME: this should be a formal MatchData object with all the goodies
          var match_data = []
          for (var i = 0, len = arguments.length; i < len; i++) {
            var arg = arguments[i];
            if (arg == undefined) {
              match_data.push(nil);
            }
            else {
              match_data.push(arg);
            }
          }

          var str = match_data.pop();
          var offset = match_data.pop();
          var match_len = match_data.length;

          // $1, $2, $3 not being parsed correctly in Ruby code
          //for (var i = 1; i < match_len; i++) {
          //  __gvars[String(i)] = match_data[i];
          //}
          $gvars["&"] = match_data[0];
          $gvars["~"] = match_data;
          return block(match_data[0]);
        });
      }
      else if (replace !== undefined) {
        if (replace['$is_a?']($opalScope.Hash)) {
          return self.replace(pattern, function(str) {
            var value = replace['$[]'](self.$str());

            return (value == null) ? nil : self.$value().$to_s();
          });
        }
        else {
          replace = $opalScope.String.$try_convert(replace);

          if (replace == null) {
            self.$raise($opalScope.TypeError, "can't convert " + (replace.$class()) + " into String");
          }

          return self.replace(pattern, replace);
        }
      }
      else {
        // convert Ruby back reference to JavaScript back reference
        replace = replace.toString().replace(/\\([1-9])/g, '$$$1')
        return self.replace(pattern, replace);
      }
    ;
    };

    $opal.defn(self, '$succ', def.$next);

    def.$sum = function(n) {
      var self = this;
      if (n == null) {
        n = 16
      }
      
      var result = 0;

      for (var i = 0, length = self.length; i < length; i++) {
        result += (self.charCodeAt(i) % ((1 << n) - 1));
      }

      return result;
    
    };

    def.$swapcase = function() {
      var self = this;
      
      var str = self.replace(/([a-z]+)|([A-Z]+)/g, function($0,$1,$2) {
        return $1 ? $0.toUpperCase() : $0.toLowerCase();
      });

      if (self.constructor === String) {
        return str;
      }

      return self.$class().$new(str);
    ;
    };

    def.$to_a = function() {
      var self = this;
      
      if (self.length === 0) {
        return [];
      }

      return [self];
    ;
    };

    def.$to_f = function() {
      var self = this;
      
      var result = parseFloat(self);

      return isNaN(result) ? 0 : result;
    ;
    };

    def.$to_i = function(base) {
      var self = this;
      if (base == null) {
        base = 10
      }
      
      var result = parseInt(self, base);

      if (isNaN(result)) {
        return 0;
      }

      return result;
    ;
    };

    def.$to_proc = function() {
      var self = this;
      
      var name = '$' + self;

      return function(arg) {
        var meth = arg[name];
        return meth ? meth.call(arg) : arg.$method_missing(name);
      };
    ;
    };

    def.$to_s = function() {
      var self = this;
      return self.toString();
    };

    $opal.defn(self, '$to_str', def.$to_s);

    $opal.defn(self, '$to_sym', def.$intern);

    def.$tr = function(from, to) {
      var self = this;
      
      if (from.length == 0 || from === to) {
        return self;
      }

      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^') {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      var in_range = false;
      for (var i = 0; i < from_length; i++) {
        var char = from_chars[i];
        if (last_from == null) {
          last_from = char;
          from_chars_expanded.push(char);
        }
        else if (char === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          var start = last_from.charCodeAt(0) + 1;
          var end = char.charCodeAt(0);
          for (var c = start; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(char);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(char);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          var in_range = false;
          for (var i = 0; i < to_length; i++) {
            var char = to_chars[i];
            if (last_from == null) {
              last_from = char;
              to_chars_expanded.push(char);
            }
            else if (char === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              var start = last_from.charCodeAt(0) + 1;
              var end = char.charCodeAt(0);
              for (var c = start; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(char);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(char);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (var i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }

      var new_str = ''
      for (var i = 0, length = self.length; i < length; i++) {
        var char = self.charAt(i);
        var sub = subs[char];
        if (inverse) {
          new_str += (sub == null ? global_sub : char);
        }
        else {
          new_str += (sub != null ? sub : char);
        }
      }
      return new_str;
    ;
    };

    def.$tr_s = function(from, to) {
      var self = this;
      
      if (from.length == 0) {
        return self;
      }

      var subs = {};
      var from_chars = from.split('');
      var from_length = from_chars.length;
      var to_chars = to.split('');
      var to_length = to_chars.length;

      var inverse = false;
      var global_sub = null;
      if (from_chars[0] === '^') {
        inverse = true;
        from_chars.shift();
        global_sub = to_chars[to_length - 1]
        from_length -= 1;
      }

      var from_chars_expanded = [];
      var last_from = null;
      var in_range = false;
      for (var i = 0; i < from_length; i++) {
        var char = from_chars[i];
        if (last_from == null) {
          last_from = char;
          from_chars_expanded.push(char);
        }
        else if (char === '-') {
          if (last_from === '-') {
            from_chars_expanded.push('-');
            from_chars_expanded.push('-');
          }
          else if (i == from_length - 1) {
            from_chars_expanded.push('-');
          }
          else {
            in_range = true;
          }
        }
        else if (in_range) {
          var start = last_from.charCodeAt(0) + 1;
          var end = char.charCodeAt(0);
          for (var c = start; c < end; c++) {
            from_chars_expanded.push(String.fromCharCode(c));
          }
          from_chars_expanded.push(char);
          in_range = null;
          last_from = null;
        }
        else {
          from_chars_expanded.push(char);
        }
      }

      from_chars = from_chars_expanded;
      from_length = from_chars.length;

      if (inverse) {
        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = true;
        }
      }
      else {
        if (to_length > 0) {
          var to_chars_expanded = [];
          var last_to = null;
          var in_range = false;
          for (var i = 0; i < to_length; i++) {
            var char = to_chars[i];
            if (last_from == null) {
              last_from = char;
              to_chars_expanded.push(char);
            }
            else if (char === '-') {
              if (last_to === '-') {
                to_chars_expanded.push('-');
                to_chars_expanded.push('-');
              }
              else if (i == to_length - 1) {
                to_chars_expanded.push('-');
              }
              else {
                in_range = true;
              }
            }
            else if (in_range) {
              var start = last_from.charCodeAt(0) + 1;
              var end = char.charCodeAt(0);
              for (var c = start; c < end; c++) {
                to_chars_expanded.push(String.fromCharCode(c));
              }
              to_chars_expanded.push(char);
              in_range = null;
              last_from = null;
            }
            else {
              to_chars_expanded.push(char);
            }
          }

          to_chars = to_chars_expanded;
          to_length = to_chars.length;
        }

        var length_diff = from_length - to_length;
        if (length_diff > 0) {
          var pad_char = (to_length > 0 ? to_chars[to_length - 1] : '');
          for (var i = 0; i < length_diff; i++) {
            to_chars.push(pad_char);
          }
        }

        for (var i = 0; i < from_length; i++) {
          subs[from_chars[i]] = to_chars[i];
        }
      }
      var new_str = ''
      var last_substitute = null
      for (var i = 0, length = self.length; i < length; i++) {
        var char = self.charAt(i);
        var sub = subs[char]
        if (inverse) {
          if (sub == null) {
            if (last_substitute == null) {
              new_str += global_sub;
              last_substitute = true;
            }
          }
          else {
            new_str += char;
            last_substitute = null;
          }
        }
        else {
          if (sub != null) {
            if (last_substitute == null || last_substitute !== sub) {
              new_str += sub;
              last_substitute = sub;
            }
          }
          else {
            new_str += char;
            last_substitute = null;
          }
        }
      }
      return new_str;
    ;
    };

    def.$upcase = function() {
      var self = this;
      return self.toUpperCase();
    };

    def.$freeze = function() {
      var self = this;
      return self;
    };

    return (def['$frozen?'] = function() {
      var self = this;
      return true;
    }, nil);
  })(self, null);
  return $opal.cdecl($opalScope, 'Symbol', $opalScope.String);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $gvars = $opal.gvars;
  return (function($base, $super) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = $MatchData._proto, $opalScope = $MatchData._scope, TMP_1;
    def.string = def.matches = def.begin = nil;
    self.$attr_reader("post_match", "pre_match", "regexp", "string");

    $opal.defs(self, '$new', TMP_1 = function(regexp, match_groups) {
      var self = this, $iter = TMP_1._p, $yield = $iter || nil, data = nil;
      TMP_1._p = null;
      data = $opal.find_super_dispatcher(self, 'new', TMP_1, null, $MatchData).apply(self, [regexp, match_groups]);
      $gvars["`"] = data.$pre_match();
      $gvars["'"] = data.$post_match();
      $gvars["~"] = data;
      return data;
    });

    def.$initialize = function(regexp, match_groups) {
      var self = this;
      self.regexp = regexp;
      self.begin = match_groups.index;
      self.string = match_groups.input;
      self.pre_match = self.string.substr(0, regexp.lastIndex - match_groups[0].length);
      self.post_match = self.string.substr(regexp.lastIndex);
      self.matches = [];
      
      for (var i = 0, length = match_groups.length; i < length; i++) {
        var group = match_groups[i];

        if (group == null) {
          self.matches.push(nil);
        }
        else {
          self.matches.push(group);
        }
      }
    
    };

    def['$[]'] = function(args) {
      var $a, self = this;
      args = $slice.call(arguments, 0);
      return ($a = self.matches)['$[]'].apply($a, [].concat(args));
    };

    def['$=='] = function(other) {
      var $a, $b, $c, $d, self = this;
      if (($a = $opalScope.MatchData['$==='](other)) === false || $a === nil) {
        return false};
      return ($a = ($b = ($c = ($d = self.string == other.string, $d !== false && $d !== nil ?self.regexp == other.regexp : $d), $c !== false && $c !== nil ?self.pre_match == other.pre_match : $c), $b !== false && $b !== nil ?self.post_match == other.post_match : $b), $a !== false && $a !== nil ?self.begin == other.begin : $a);
    };

    def.$begin = function(pos) {
      var $a, $b, $c, self = this;
      if (($a = ($b = ($c = pos['$=='](0), ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = pos['$=='](1), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "MatchData#begin only supports 0th element")};
      return self.begin;
    };

    def.$captures = function() {
      var self = this;
      return self.matches.slice(1);
    };

    def.$inspect = function() {
      var self = this;
      
      var str = "#<MatchData " + (self.matches[0]).$inspect();

      for (var i = 1, length = self.matches.length; i < length; i++) {
        str += " " + i + ":" + (self.matches[i]).$inspect();
      }

      return str + ">";
    ;
    };

    def.$length = function() {
      var self = this;
      return self.matches.length;
    };

    $opal.defn(self, '$size', def.$length);

    def.$to_a = function() {
      var self = this;
      return self.matches;
    };

    def.$to_s = function() {
      var self = this;
      return self.matches[0];
    };

    return (def.$values_at = function(indexes) {
      var self = this;
      indexes = $slice.call(arguments, 0);
      
      var values       = [],
          match_length = self.matches.length;

      for (var i = 0, length = indexes.length; i < length; i++) {
        var pos = indexes[i];

        if (pos >= 0) {
          values.push(self.matches[pos]);
        }
        else {
          pos += match_length;

          if (pos > 0) {
            values.push(self.matches[pos]);
          }
          else {
            values.push(nil);
          }
        }
      }

      return values;
    ;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_4, $c, TMP_6, $d, TMP_8, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $hash2 = $opal.hash2;
  (function($base, $super) {
    function $Encoding(){};
    var self = $Encoding = $klass($base, $super, 'Encoding', $Encoding);

    var def = $Encoding._proto, $opalScope = $Encoding._scope, TMP_1;
    def.ascii = def.dummy = def.name = nil;
    $opal.defs(self, '$register', TMP_1 = function(name, options) {
      var $a, $b, $c, TMP_2, self = this, $iter = TMP_1._p, block = $iter || nil, names = nil, encoding = nil;
      if (options == null) {
        options = $hash2([], {})
      }
      TMP_1._p = null;
      names = [name]['$+']((((($a = options['$[]']("aliases")) !== false && $a !== nil) ? $a : [])));
      encoding = ($a = ($b = $opalScope.Class).$new, $a._p = block.$to_proc(), $a).call($b, self).$new(name, names, ((($a = options['$[]']("ascii")) !== false && $a !== nil) ? $a : false), ((($a = options['$[]']("dummy")) !== false && $a !== nil) ? $a : false));
      return ($a = ($c = names).$each, $a._p = (TMP_2 = function(name){var self = TMP_2._s || this;if (name == null) name = nil;
      return self.$const_set(name.$sub("-", "_"), encoding)}, TMP_2._s = self, TMP_2), $a).call($c);
    });

    $opal.defs(self, '$find', function(name) {try {

      var $a, $b, TMP_3, self = this;
      if (($a = self['$==='](name)) !== false && $a !== nil) {
        return name};
      ($a = ($b = self.$constants()).$each, $a._p = (TMP_3 = function(const$){var self = TMP_3._s || this, $a, $b, encoding = nil;if (const$ == null) const$ = nil;
      encoding = self.$const_get(const$);
        if (($a = ((($b = encoding.$name()['$=='](name)) !== false && $b !== nil) ? $b : encoding.$names()['$include?'](name))) !== false && $a !== nil) {
          $opal.$return(encoding)
          } else {
          return nil
        };}, TMP_3._s = self, TMP_3), $a).call($b);
      return self.$raise($opalScope.ArgumentError, "unknown encoding name - " + (name));
      } catch ($returner) { if ($returner === $opal.returner) { return $returner.$v } throw $returner; }
    });

    (function(self) {
      var $opalScope = self._scope, def = self._proto;
      return self.$attr_accessor("default_external")
    })(self.$singleton_class());

    self.$attr_reader("name", "names");

    def.$initialize = function(name, names, ascii, dummy) {
      var self = this;
      self.name = name;
      self.names = names;
      self.ascii = ascii;
      return self.dummy = dummy;
    };

    def['$ascii_compatible?'] = function() {
      var self = this;
      return self.ascii;
    };

    def['$dummy?'] = function() {
      var self = this;
      return self.dummy;
    };

    def.$to_s = function() {
      var self = this;
      return self.name;
    };

    def.$inspect = function() {
      var $a, self = this;
      return "#<Encoding:" + (self.name) + ((function() {if (($a = self.dummy) !== false && $a !== nil) {
        return " (dummy)"
        } else {
        return nil
      }; return nil; })()) + ">";
    };

    def.$each_byte = function() {
      var self = this;
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$getbyte = function() {
      var self = this;
      return self.$raise($opalScope.NotImplementedError);
    };

    return (def.$bytesize = function() {
      var self = this;
      return self.$raise($opalScope.NotImplementedError);
    }, nil);
  })(self, null);
  ($a = ($b = $opalScope.Encoding).$register, $a._p = (TMP_4 = function(){var self = TMP_4._s || this, TMP_5;
  $opal.defn(self, '$each_byte', TMP_5 = function(string) {
      var $a, self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        if (code <= 0x7f) {
          ((($a = $opal.$yield1(block, code)) === $breaker) ? $breaker.$v : $a);
        }
        else {
          var encoded = encodeURIComponent(string.charAt(i)).substr(1).split('%');

          for (var j = 0, encoded_length = encoded.length; j < encoded_length; j++) {
            ((($a = $opal.$yield1(block, parseInt(encoded[j], 16))) === $breaker) ? $breaker.$v : $a);
          }
        }
      }
    
    });
    return ($opal.defn(self, '$bytesize', function() {
      var self = this;
      return self.$bytes().$length();
    }), nil);}, TMP_4._s = self, TMP_4), $a).call($b, "UTF-8", $hash2(["aliases", "ascii"], {"aliases": ["CP65001"], "ascii": true}));
  ($a = ($c = $opalScope.Encoding).$register, $a._p = (TMP_6 = function(){var self = TMP_6._s || this, TMP_7;
  $opal.defn(self, '$each_byte', TMP_7 = function(string) {
      var $a, self = this, $iter = TMP_7._p, block = $iter || nil;
      TMP_7._p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        var code = string.charCodeAt(i);

        ((($a = $opal.$yield1(block, code & 0xff)) === $breaker) ? $breaker.$v : $a);
        ((($a = $opal.$yield1(block, code >> 8)) === $breaker) ? $breaker.$v : $a);
      }
    
    });
    return ($opal.defn(self, '$bytesize', function() {
      var self = this;
      return self.$bytes().$length();
    }), nil);}, TMP_6._s = self, TMP_6), $a).call($c, "UTF-16LE");
  ($a = ($d = $opalScope.Encoding).$register, $a._p = (TMP_8 = function(){var self = TMP_8._s || this, TMP_9;
  $opal.defn(self, '$each_byte', TMP_9 = function(string) {
      var $a, self = this, $iter = TMP_9._p, block = $iter || nil;
      TMP_9._p = null;
      
      for (var i = 0, length = string.length; i < length; i++) {
        ((($a = $opal.$yield1(block, string.charCodeAt(i) & 0xff)) === $breaker) ? $breaker.$v : $a);
      }
    
    });
    return ($opal.defn(self, '$bytesize', function() {
      var self = this;
      return self.$bytes().$length();
    }), nil);}, TMP_8._s = self, TMP_8), $a).call($d, "ASCII-8BIT", $hash2(["aliases", "ascii"], {"aliases": ["BINARY"], "ascii": true}));
  return (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = $String._proto, $opalScope = $String._scope, TMP_10;
    def.encoding = nil;
    def.encoding = ($opalScope.Encoding)._scope.UTF_16LE;

    def.$bytes = function() {
      var self = this;
      return self.$each_byte().$to_a();
    };

    def.$bytesize = function() {
      var self = this;
      return self.encoding.$bytesize(self);
    };

    def.$each_byte = TMP_10 = function() {
      var $a, $b, self = this, $iter = TMP_10._p, block = $iter || nil;
      TMP_10._p = null;
      if (block === nil) {
        return self.$enum_for("each_byte")};
      ($a = ($b = self.encoding).$each_byte, $a._p = block.$to_proc(), $a).call($b, self);
      return self;
    };

    def.$encoding = function() {
      var self = this;
      return self.encoding;
    };

    def.$force_encoding = function(encoding) {
      var self = this;
      encoding = $opalScope.Encoding.$find(encoding);
      if (encoding['$=='](self.encoding)) {
        return self};
      
      var result = new native_string(self);
      result.encoding = encoding;

      return result;
    
    };

    return (def.$getbyte = function(idx) {
      var self = this;
      return self.encoding.$getbyte(self, idx);
    }, nil);
  })(self, null);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = $Numeric._proto, $opalScope = $Numeric._scope, TMP_1, TMP_2, TMP_3, TMP_4, TMP_5;
    self.$include($opalScope.Comparable);

    def._isNumber = true;

    (function(self) {
      var $opalScope = self._scope, def = self._proto;
      return self.$undef_method("new")
    })(self.$singleton_class());

    def.$coerce = function(other, type) {
      var self = this, $case = nil;
      if (type == null) {
        type = "operation"
      }
      try {
      
      if (other._isNumber) {
        return [self, other];
      }
      else {
        return other.$coerce(self);
      }
    
      } catch ($err) {if (true) {
        return (function() {$case = type;if ("operation"['$===']($case)) {return self.$raise($opalScope.TypeError, "" + (other.$class()) + " can't be coerce into Numeric")}else if ("comparison"['$===']($case)) {return self.$raise($opalScope.ArgumentError, "comparison of " + (self.$class()) + " with " + (other.$class()) + " failed")}else { return nil }})()
        }else { throw $err; }
      };
    };

    def.$send_coerced = function(method, other) {
      var $a, self = this, type = nil, $case = nil, a = nil, b = nil;
      type = (function() {$case = method;if ("+"['$===']($case) || "-"['$===']($case) || "*"['$===']($case) || "/"['$===']($case) || "%"['$===']($case) || "&"['$===']($case) || "|"['$===']($case) || "^"['$===']($case) || "**"['$===']($case)) {return "operation"}else if (">"['$===']($case) || ">="['$===']($case) || "<"['$===']($case) || "<="['$===']($case) || "<=>"['$===']($case)) {return "comparison"}else { return nil }})();
      $a = $opal.to_ary(self.$coerce(other, type)), a = ($a[0] == null ? nil : $a[0]), b = ($a[1] == null ? nil : $a[1]);
      return a.$__send__(method, b);
    };

    def['$+'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self + other;
      }
      else {
        return self.$send_coerced("+", other);
      }
    
    };

    def['$-'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self - other;
      }
      else {
        return self.$send_coerced("-", other);
      }
    
    };

    def['$*'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self * other;
      }
      else {
        return self.$send_coerced("*", other);
      }
    
    };

    def['$/'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self / other;
      }
      else {
        return self.$send_coerced("/", other);
      }
    
    };

    def['$%'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        if (other < 0 || self < 0) {
          return (self % other + other) % other;
        }
        else {
          return self % other;
        }
      }
      else {
        return self.$send_coerced("%", other);
      }
    
    };

    def['$&'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self & other;
      }
      else {
        return self.$send_coerced("&", other);
      }
    
    };

    def['$|'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self | other;
      }
      else {
        return self.$send_coerced("|", other);
      }
    
    };

    def['$^'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self ^ other;
      }
      else {
        return self.$send_coerced("^", other);
      }
    
    };

    def['$<'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self < other;
      }
      else {
        return self.$send_coerced("<", other);
      }
    
    };

    def['$<='] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self <= other;
      }
      else {
        return self.$send_coerced("<=", other);
      }
    
    };

    def['$>'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self > other;
      }
      else {
        return self.$send_coerced(">", other);
      }
    
    };

    def['$>='] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self >= other;
      }
      else {
        return self.$send_coerced(">=", other);
      }
    
    };

    def['$<=>'] = function(other) {
      var self = this;
      try {
      
      if (other._isNumber) {
        return self > other ? 1 : (self < other ? -1 : 0);
      }
      else {
        return self.$send_coerced("<=>", other);
      }
    
      } catch ($err) {if ($opalScope.ArgumentError['$===']($err)) {
        return nil
        }else { throw $err; }
      };
    };

    def['$<<'] = function(count) {
      var self = this;
      return self << count.$to_int();
    };

    def['$>>'] = function(count) {
      var self = this;
      return self >> count.$to_int();
    };

    def['$+@'] = function() {
      var self = this;
      return +self;
    };

    def['$-@'] = function() {
      var self = this;
      return -self;
    };

    def['$~'] = function() {
      var self = this;
      return ~self;
    };

    def['$**'] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return Math.pow(self, other);
      }
      else {
        return self.$send_coerced("**", other);
      }
    
    };

    def['$=='] = function(other) {
      var self = this;
      
      if (other._isNumber) {
        return self == Number(other);
      }
      else if (other['$respond_to?']("==")) {
        return other['$=='](self);
      }
      else {
        return false;
      }
    ;
    };

    def.$abs = function() {
      var self = this;
      return Math.abs(self);
    };

    def.$ceil = function() {
      var self = this;
      return Math.ceil(self);
    };

    def.$chr = function() {
      var self = this;
      return String.fromCharCode(self);
    };

    def.$conj = function() {
      var self = this;
      return self;
    };

    $opal.defn(self, '$conjugate', def.$conj);

    def.$downto = TMP_1 = function(finish) {
      var $a, self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("downto", finish)};
      
      for (var i = self; i >= finish; i--) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    $opal.defn(self, '$eql?', def['$==']);

    $opal.defn(self, '$equal?', def['$==']);

    def['$even?'] = function() {
      var self = this;
      return self % 2 === 0;
    };

    def.$floor = function() {
      var self = this;
      return Math.floor(self);
    };

    def.$hash = function() {
      var self = this;
      return self.toString();
    };

    def['$integer?'] = function() {
      var self = this;
      return self % 1 === 0;
    };

    def['$is_a?'] = TMP_2 = function(klass) {var $zuper = $slice.call(arguments, 0);
      var $a, $b, self = this, $iter = TMP_2._p, $yield = $iter || nil;
      TMP_2._p = null;
      if (($a = (($b = klass['$==']($opalScope.Float)) ? $opalScope.Float['$==='](self) : $b)) !== false && $a !== nil) {
        return true};
      if (($a = (($b = klass['$==']($opalScope.Integer)) ? $opalScope.Integer['$==='](self) : $b)) !== false && $a !== nil) {
        return true};
      return $opal.find_super_dispatcher(self, 'is_a?', TMP_2, $iter).apply(self, $zuper);
    };

    $opal.defn(self, '$magnitude', def.$abs);

    $opal.defn(self, '$modulo', def['$%']);

    def.$next = function() {
      var self = this;
      return self + 1;
    };

    def['$nonzero?'] = function() {
      var self = this;
      return self == 0 ? nil : self;
    };

    def['$odd?'] = function() {
      var self = this;
      return self % 2 !== 0;
    };

    def.$ord = function() {
      var self = this;
      return self;
    };

    def.$pred = function() {
      var self = this;
      return self - 1;
    };

    def.$step = TMP_3 = function(limit, step) {
      var $a, self = this, $iter = TMP_3._p, block = $iter || nil;
      if (step == null) {
        step = 1
      }
      TMP_3._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("step", limit, step)};
      if (($a = step == 0) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "step cannot be 0")};
      
      var value = self;

      if (step > 0) {
        while (value <= limit) {
          block(value);
          value += step;
        }
      }
      else {
        while (value >= limit) {
          block(value);
          value += step;
        }
      }
    
      return self;
    };

    $opal.defn(self, '$succ', def.$next);

    def.$times = TMP_4 = function() {
      var $a, self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("times")};
      
      for (var i = 0; i < self; i++) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    def.$to_f = function() {
      var self = this;
      return parseFloat(self);
    };

    def.$to_i = function() {
      var self = this;
      return parseInt(self);
    };

    $opal.defn(self, '$to_int', def.$to_i);

    def.$to_s = function(base) {
      var $a, $b, self = this;
      if (base == null) {
        base = 10
      }
      if (($a = ((($b = base['$<'](2)) !== false && $b !== nil) ? $b : base['$>'](36))) !== false && $a !== nil) {
        self.$raise($opalScope.ArgumentError, "base must be between 2 and 36")};
      return self.toString(base);
    };

    $opal.defn(self, '$inspect', def.$to_s);

    def.$divmod = function(rhs) {
      var self = this, q = nil, r = nil;
      q = (self['$/'](rhs)).$floor();
      r = self['$%'](rhs);
      return [q, r];
    };

    def.$upto = TMP_5 = function(finish) {
      var $a, self = this, $iter = TMP_5._p, block = $iter || nil;
      TMP_5._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("upto", finish)};
      
      for (var i = self; i <= finish; i++) {
        if (block(i) === $breaker) {
          return $breaker.$v;
        }
      }
    
      return self;
    };

    def['$zero?'] = function() {
      var self = this;
      return self == 0;
    };

    def.$size = function() {
      var self = this;
      return 4;
    };

    def['$nan?'] = function() {
      var self = this;
      return isNaN(self);
    };

    def['$finite?'] = function() {
      var self = this;
      return self == Infinity || self == -Infinity;
    };

    return (def['$infinite?'] = function() {
      var $a, self = this;
      if (($a = self == Infinity) !== false && $a !== nil) {
        return +1;
      } else if (($a = self == -Infinity) !== false && $a !== nil) {
        return -1;
        } else {
        return nil
      };
    }, nil);
  })(self, null);
  $opal.cdecl($opalScope, 'Fixnum', $opalScope.Numeric);
  (function($base, $super) {
    function $Integer(){};
    var self = $Integer = $klass($base, $super, 'Integer', $Integer);

    var def = $Integer._proto, $opalScope = $Integer._scope;
    return ($opal.defs(self, '$===', function(other) {
      var self = this;
      return !!(other._isNumber && (other % 1) == 0);
    }), nil)
  })(self, $opalScope.Numeric);
  return (function($base, $super) {
    function $Float(){};
    var self = $Float = $klass($base, $super, 'Float', $Float);

    var def = $Float._proto, $opalScope = $Float._scope;
    $opal.defs(self, '$===', function(other) {
      var self = this;
      return !!(other._isNumber && (other % 1) != 0);
    });

    $opal.cdecl($opalScope, 'INFINITY', Infinity);

    return $opal.cdecl($opalScope, 'NAN', NaN);
  })(self, $opalScope.Numeric);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = $Proc._proto, $opalScope = $Proc._scope, TMP_1, TMP_2;
    def._isProc = true;

    def.is_lambda = false;

    $opal.defs(self, '$new', TMP_1 = function() {
      var $a, self = this, $iter = TMP_1._p, block = $iter || nil;
      TMP_1._p = null;
      if (($a = block) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "tried to create a Proc object without a block")};
      return block;
    });

    def.$call = TMP_2 = function(args) {
      var self = this, $iter = TMP_2._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_2._p = null;
      
      if (block !== nil) {
        self._p = block;
      }

      var result;

      if (self.is_lambda) {
        result = self.apply(null, args);
      }
      else {
        result = Opal.$yieldX(self, args);
      }

      if (result === $breaker) {
        return $breaker.$v;
      }

      return result;
    
    };

    $opal.defn(self, '$[]', def.$call);

    def.$to_proc = function() {
      var self = this;
      return self;
    };

    def['$lambda?'] = function() {
      var self = this;
      return !!self.is_lambda;
    };

    return (def.$arity = function() {
      var self = this;
      return self.length;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  (function($base, $super) {
    function $Method(){};
    var self = $Method = $klass($base, $super, 'Method', $Method);

    var def = $Method._proto, $opalScope = $Method._scope, TMP_1;
    def.method = def.receiver = def.owner = def.name = def.obj = nil;
    self.$attr_reader("owner", "receiver", "name");

    def.$initialize = function(receiver, method, name) {
      var self = this;
      self.receiver = receiver;
      self.owner = receiver.$class();
      self.name = name;
      return self.method = method;
    };

    def.$arity = function() {
      var self = this;
      return self.method.$arity();
    };

    def.$call = TMP_1 = function(args) {
      var self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_1._p = null;
      
      self.method._p = block;

      return self.method.apply(self.receiver, args);
    ;
    };

    $opal.defn(self, '$[]', def.$call);

    def.$unbind = function() {
      var self = this;
      return $opalScope.UnboundMethod.$new(self.owner, self.method, self.name);
    };

    def.$to_proc = function() {
      var self = this;
      return self.method;
    };

    return (def.$inspect = function() {
      var self = this;
      return "#<Method: " + (self.obj.$class().$name()) + "#" + (self.name) + "}>";
    }, nil);
  })(self, null);
  return (function($base, $super) {
    function $UnboundMethod(){};
    var self = $UnboundMethod = $klass($base, $super, 'UnboundMethod', $UnboundMethod);

    var def = $UnboundMethod._proto, $opalScope = $UnboundMethod._scope;
    def.method = def.name = def.owner = nil;
    self.$attr_reader("owner", "name");

    def.$initialize = function(owner, method, name) {
      var self = this;
      self.owner = owner;
      self.method = method;
      return self.name = name;
    };

    def.$arity = function() {
      var self = this;
      return self.method.$arity();
    };

    def.$bind = function(object) {
      var self = this;
      return $opalScope.Method.$new(object, self.method, self.name);
    };

    return (def.$inspect = function() {
      var self = this;
      return "#<UnboundMethod: " + (self.owner.$name()) + "#" + (self.name) + ">";
    }, nil);
  })(self, null);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Range(){};
    var self = $Range = $klass($base, $super, 'Range', $Range);

    var def = $Range._proto, $opalScope = $Range._scope, TMP_1, TMP_2, TMP_3;
    def.begin = def.exclude = def.end = nil;
    self.$include($opalScope.Enumerable);

    def._isRange = true;

    self.$attr_reader("begin", "end");

    def.$initialize = function(first, last, exclude) {
      var self = this;
      if (exclude == null) {
        exclude = false
      }
      self.begin = first;
      self.end = last;
      return self.exclude = exclude;
    };

    def['$=='] = function(other) {
      var self = this;
      
      if (!other._isRange) {
        return false;
      }

      return self.exclude === other.exclude &&
             self.begin   ==  other.begin &&
             self.end     ==  other.end;
    
    };

    def['$==='] = function(obj) {
      var self = this;
      return self['$include?'](obj);
    };

    def['$cover?'] = function(value) {
      var $a, $b, self = this;
      return (($a = self.begin['$<='](value)) ? ((function() {if (($b = self.exclude) !== false && $b !== nil) {
        return value['$<'](self.end)
        } else {
        return value['$<='](self.end)
      }; return nil; })()) : $a);
    };

    $opal.defn(self, '$last', def.$end);

    def.$each = TMP_1 = function() {
      var $a, $b, $c, self = this, $iter = TMP_1._p, block = $iter || nil, current = nil, last = nil;
      TMP_1._p = null;
      if (block === nil) {
        return self.$enum_for("each")};
      current = self.begin;
      last = self.end;
      while (current['$<'](last)) {
      if ($opal.$yield1(block, current) === $breaker) return $breaker.$v;
      current = current.$succ();};
      if (($a = ($b = ($c = self.exclude, ($c === nil || $c === false)), $b !== false && $b !== nil ?current['$=='](last) : $b)) !== false && $a !== nil) {
        if ($opal.$yield1(block, current) === $breaker) return $breaker.$v};
      return self;
    };

    def['$eql?'] = function(other) {
      var $a, $b, self = this;
      if (($a = $opalScope.Range['$==='](other)) === false || $a === nil) {
        return false};
      return ($a = ($b = self.exclude['$==='](other['$exclude_end?']()), $b !== false && $b !== nil ?self.begin['$eql?'](other.$begin()) : $b), $a !== false && $a !== nil ?self.end['$eql?'](other.$end()) : $a);
    };

    def['$exclude_end?'] = function() {
      var self = this;
      return self.exclude;
    };

    $opal.defn(self, '$first', def.$begin);

    def['$include?'] = function(obj) {
      var self = this;
      return self['$cover?'](obj);
    };

    def.$max = TMP_2 = function() {var $zuper = $slice.call(arguments, 0);
      var self = this, $iter = TMP_2._p, $yield = $iter || nil;
      TMP_2._p = null;
      if (($yield !== nil)) {
        return $opal.find_super_dispatcher(self, 'max', TMP_2, $iter).apply(self, $zuper)
        } else {
        return self.exclude ? self.end - 1 : self.end;
      };
    };

    def.$min = TMP_3 = function() {var $zuper = $slice.call(arguments, 0);
      var self = this, $iter = TMP_3._p, $yield = $iter || nil;
      TMP_3._p = null;
      if (($yield !== nil)) {
        return $opal.find_super_dispatcher(self, 'min', TMP_3, $iter).apply(self, $zuper)
        } else {
        return self.begin
      };
    };

    $opal.defn(self, '$member?', def['$include?']);

    def.$step = function(n) {
      var self = this;
      if (n == null) {
        n = 1
      }
      return self.$raise($opalScope.NotImplementedError);
    };

    def.$to_s = function() {
      var self = this;
      return self.begin.$inspect() + (self.exclude ? '...' : '..') + self.end.$inspect();
    };

    return $opal.defn(self, '$inspect', def.$to_s);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = $Time._proto, $opalScope = $Time._scope;
    self.$include($opalScope.Comparable);

    
    var days_of_week = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        short_days   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        short_months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        long_months  = ["January", "Febuary", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  ;

    $opal.defs(self, '$at', function(seconds, frac) {
      var self = this;
      if (frac == null) {
        frac = 0
      }
      return new Date(seconds * 1000 + frac);
    });

    $opal.defs(self, '$new', function(year, month, day, hour, minute, second, utc_offset) {
      var self = this;
      
      switch (arguments.length) {
        case 1:
          return new Date(year, 0);

        case 2:
          return new Date(year, month - 1);

        case 3:
          return new Date(year, month - 1, day);

        case 4:
          return new Date(year, month - 1, day, hour);

        case 5:
          return new Date(year, month - 1, day, hour, minute);

        case 6:
          return new Date(year, month - 1, day, hour, minute, second);

        case 7:
          self.$raise($opalScope.NotImplementedError);

        default:
          return new Date();
      }
    
    });

    $opal.defs(self, '$local', function(year, month, day, hour, minute, second, millisecond) {
      var $a, self = this;
      if (month == null) {
        month = nil
      }
      if (day == null) {
        day = nil
      }
      if (hour == null) {
        hour = nil
      }
      if (minute == null) {
        minute = nil
      }
      if (second == null) {
        second = nil
      }
      if (millisecond == null) {
        millisecond = nil
      }
      if (($a = arguments.length === 10) !== false && $a !== nil) {
        
        var args = $slice.call(arguments).reverse();

        second = args[9];
        minute = args[8];
        hour   = args[7];
        day    = args[6];
        month  = args[5];
        year   = args[4];
      };
      year = (function() {if (($a = year['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return year.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(year, $opalScope.Integer, "to_int")
      }; return nil; })();
      month = (function() {if (($a = month['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return month.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(((($a = month) !== false && $a !== nil) ? $a : 1), $opalScope.Integer, "to_int")
      }; return nil; })();
      if (($a = month['$between?'](1, 12)) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "month out of range: " + (month))};
      day = (function() {if (($a = day['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return day.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(((($a = day) !== false && $a !== nil) ? $a : 1), $opalScope.Integer, "to_int")
      }; return nil; })();
      if (($a = day['$between?'](1, 31)) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "day out of range: " + (day))};
      hour = (function() {if (($a = hour['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return hour.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(((($a = hour) !== false && $a !== nil) ? $a : 0), $opalScope.Integer, "to_int")
      }; return nil; })();
      if (($a = hour['$between?'](0, 24)) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "hour out of range: " + (hour))};
      minute = (function() {if (($a = minute['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return minute.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(((($a = minute) !== false && $a !== nil) ? $a : 0), $opalScope.Integer, "to_int")
      }; return nil; })();
      if (($a = minute['$between?'](0, 59)) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "minute out of range: " + (minute))};
      second = (function() {if (($a = second['$kind_of?']($opalScope.String)) !== false && $a !== nil) {
        return second.$to_i()
        } else {
        return $opalScope.Opal.$coerce_to(((($a = second) !== false && $a !== nil) ? $a : 0), $opalScope.Integer, "to_int")
      }; return nil; })();
      if (($a = second['$between?'](0, 59)) === false || $a === nil) {
        self.$raise($opalScope.ArgumentError, "second out of range: " + (second))};
      return ($a = self).$new.apply($a, [].concat([year, month, day, hour, minute, second].$compact()));
    });

    $opal.defs(self, '$gm', function(year, month, day, hour, minute, second, utc_offset) {
      var $a, self = this;
      if (($a = year['$nil?']()) !== false && $a !== nil) {
        self.$raise($opalScope.TypeError, "missing year (got nil)")};
      
      switch (arguments.length) {
        case 1:
          return new Date(Date.UTC(year, 0));

        case 2:
          return new Date(Date.UTC(year, month - 1));

        case 3:
          return new Date(Date.UTC(year, month - 1, day));

        case 4:
          return new Date(Date.UTC(year, month - 1, day, hour));

        case 5:
          return new Date(Date.UTC(year, month - 1, day, hour, minute));

        case 6:
          return new Date(Date.UTC(year, month - 1, day, hour, minute, second));

        case 7:
          self.$raise($opalScope.NotImplementedError);
      }
    
    });

    (function(self) {
      var $opalScope = self._scope, def = self._proto;
      self._proto.$mktime = self._proto.$local;
      return self._proto.$utc = self._proto.$gm;
    })(self.$singleton_class());

    $opal.defs(self, '$now', function() {
      var self = this;
      return new Date();
    });

    def['$+'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Time['$==='](other)) !== false && $a !== nil) {
        self.$raise($opalScope.TypeError, "time + time?")};
      other = $opalScope.Opal.$coerce_to(other, $opalScope.Integer, "to_int");
      return new Date(self.getTime() + (other * 1000));
    };

    def['$-'] = function(other) {
      var $a, self = this;
      if (($a = $opalScope.Time['$==='](other)) !== false && $a !== nil) {
        return (self.getTime() - other.getTime()) / 1000;
        } else {
        other = $opalScope.Opal.$coerce_to(other, $opalScope.Integer, "to_int");
        return new Date(self.getTime() - (other * 1000));
      };
    };

    def['$<=>'] = function(other) {
      var self = this;
      return self.$to_f()['$<=>'](other.$to_f());
    };

    def['$=='] = function(other) {
      var self = this;
      return self.$to_f() === other.$to_f();
    };

    def.$day = function() {
      var self = this;
      return self.getDate();
    };

    def.$yday = function() {
      var self = this;
      
      // http://javascript.about.com/library/bldayyear.htm
      var onejan = new Date(self.getFullYear(), 0, 1);
      return Math.ceil((self - onejan) / 86400000);
    
    };

    def.$isdst = function() {
      var self = this;
      return self.$raise($opalScope.NotImplementedError);
    };

    def['$eql?'] = function(other) {
      var $a, self = this;
      return ($a = other['$is_a?']($opalScope.Time), $a !== false && $a !== nil ?(self['$<=>'](other))['$zero?']() : $a);
    };

    def['$friday?'] = function() {
      var self = this;
      return self.getDay() === 5;
    };

    def.$hour = function() {
      var self = this;
      return self.getHours();
    };

    def.$inspect = function() {
      var self = this;
      return self.toString();
    };

    $opal.defn(self, '$mday', def.$day);

    def.$min = function() {
      var self = this;
      return self.getMinutes();
    };

    def.$mon = function() {
      var self = this;
      return self.getMonth() + 1;
    };

    def['$monday?'] = function() {
      var self = this;
      return self.getDay() === 1;
    };

    $opal.defn(self, '$month', def.$mon);

    def['$saturday?'] = function() {
      var self = this;
      return self.getDay() === 6;
    };

    def.$sec = function() {
      var self = this;
      return self.getSeconds();
    };

    def.$usec = function() {
      var self = this;
      self.$warn("Microseconds are not supported");
      return 0;
    };

    def.$zone = function() {
      var self = this;
      
      var string = self.toString(),
          result;

      if (string.indexOf('(') == -1) {
        result = string.match(/[A-Z]{3,4}/)[0];
      }
      else {
        result = string.match(/\([^)]+\)/)[0].match(/[A-Z]/g).join('');
      }

      if (result == "GMT" && /(GMT\W*\d{4})/.test(string)) {
        return RegExp.$1;
      }
      else {
        return result;
      }
    
    };

    def.$gmt_offset = function() {
      var self = this;
      return -self.getTimezoneOffset() * 60;
    };

    def.$strftime = function(format) {
      var self = this;
      
      return format.replace(/%([\-_#^0]*:{0,2})(\d+)?([EO]*)(.)/g, function(full, flags, width, _, conv) {
        var result = "",
            width  = parseInt(width),
            zero   = flags.indexOf('0') !== -1,
            pad    = flags.indexOf('-') === -1,
            blank  = flags.indexOf('_') !== -1,
            upcase = flags.indexOf('^') !== -1,
            invert = flags.indexOf('#') !== -1,
            colons = (flags.match(':') || []).length;

        if (zero && blank) {
          if (flags.indexOf('0') < flags.indexOf('_')) {
            zero = false;
          }
          else {
            blank = false;
          }
        }

        switch (conv) {
          case 'Y':
            result += self.getFullYear();
            break;

          case 'C':
            zero    = !blank;
            result += Match.round(self.getFullYear() / 100);
            break;

          case 'y':
            zero    = !blank;
            result += (self.getFullYear() % 100);
            break;

          case 'm':
            zero    = !blank;
            result += (self.getMonth() + 1);
            break;

          case 'B':
            result += long_months[self.getMonth()];
            break;

          case 'b':
          case 'h':
            blank   = !zero;
            result += short_months[self.getMonth()];
            break;

          case 'd':
            zero    = !blank
            result += self.getDate();
            break;

          case 'e':
            blank   = !zero
            result += self.getDate();
            break;

          case 'j':
            result += self.$yday();
            break;

          case 'H':
            zero    = !blank;
            result += self.getHours();
            break;

          case 'k':
            blank   = !zero;
            result += self.getHours();
            break;

          case 'I':
            zero    = !blank;
            result += (self.getHours() % 12 || 12);
            break;

          case 'l':
            blank   = !zero;
            result += (self.getHours() % 12 || 12);
            break;

          case 'P':
            result += (self.getHours() >= 12 ? "pm" : "am");
            break;

          case 'p':
            result += (self.getHours() >= 12 ? "PM" : "AM");
            break;

          case 'M':
            zero    = !blank;
            result += self.getMinutes();
            break;

          case 'S':
            zero    = !blank;
            result += self.getSeconds();
            break;

          case 'L':
            zero    = !blank;
            width   = isNaN(width) ? 3 : width;
            result += self.getMilliseconds();
            break;

          case 'N':
            width   = isNaN(width) ? 9 : width;
            result += (self.getMilliseconds().toString()).$rjust(3, "0");
            result  = (result).$ljust(width, "0");
            break;

          case 'z':
            var offset  = self.getTimezoneOffset(),
                hours   = Math.floor(Math.abs(offset) / 60),
                minutes = Math.abs(offset) % 60;

            result += offset < 0 ? "+" : "-";
            result += hours < 10 ? "0" : "";
            result += hours;

            if (colons > 0) {
              result += ":";
            }

            result += minutes < 10 ? "0" : "";
            result += minutes;

            if (colons > 1) {
              result += ":00";
            }

            break;

          case 'Z':
            result += self.$zone();
            break;

          case 'A':
            result += days_of_week[self.getDay()];
            break;

          case 'a':
            result += short_days[self.getDay()];
            break;

          case 'u':
            result += (self.getDay() + 1);
            break;

          case 'w':
            result += self.getDay();
            break;

          // TODO: week year
          // TODO: week number

          case 's':
            result += parseInt(self.getTime() / 1000)
            break;

          case 'n':
            result += "\n";
            break;

          case 't':
            result += "\t";
            break;

          case '%':
            result += "%";
            break;

          case 'c':
            result += self.$strftime("%a %b %e %T %Y");
            break;

          case 'D':
          case 'x':
            result += self.$strftime("%m/%d/%y");
            break;

          case 'F':
            result += self.$strftime("%Y-%m-%d");
            break;

          case 'v':
            result += self.$strftime("%e-%^b-%4Y");
            break;

          case 'r':
            result += self.$strftime("%I:%M:%S %p");
            break;

          case 'R':
            result += self.$strftime("%H:%M");
            break;

          case 'T':
          case 'X':
            result += self.$strftime("%H:%M:%S");
            break;

          default:
            return full;
        }

        if (upcase) {
          result = result.toUpperCase();
        }

        if (invert) {
          result = result.replace(/[A-Z]/, function(c) { c.toLowerCase() }).
                          replace(/[a-z]/, function(c) { c.toUpperCase() });
        }

        if (pad && (zero || blank)) {
          result = (result).$rjust(isNaN(width) ? 2 : width, blank ? " " : "0");
        }

        return result;
      });
    
    };

    def['$sunday?'] = function() {
      var self = this;
      return self.getDay() === 0;
    };

    def['$thursday?'] = function() {
      var self = this;
      return self.getDay() === 4;
    };

    def.$to_a = function() {
      var self = this;
      return [self.$sec(), self.$min(), self.$hour(), self.$day(), self.$month(), self.$year(), self.$wday(), self.$yday(), self.$isdst(), self.$zone()];
    };

    def.$to_f = function() {
      var self = this;
      return self.getTime() / 1000;
    };

    def.$to_i = function() {
      var self = this;
      return parseInt(self.getTime() / 1000);
    };

    $opal.defn(self, '$to_s', def.$inspect);

    def['$tuesday?'] = function() {
      var self = this;
      return self.getDay() === 2;
    };

    def.$wday = function() {
      var self = this;
      return self.getDay();
    };

    def['$wednesday?'] = function() {
      var self = this;
      return self.getDay() === 3;
    };

    return (def.$year = function() {
      var self = this;
      return self.getFullYear();
    }, nil);
  })(self, null);
  return (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = $Time._proto, $opalScope = $Time._scope;
    $opal.defs(self, '$parse', function(str) {
      var self = this;
      return new Date(Date.parse(str));
    });

    return (def.$iso8601 = function() {
      var self = this;
      return self.$strftime("%FT%T%z");
    }, nil);
  })(self, null);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = $Struct._proto, $opalScope = $Struct._scope, TMP_1, TMP_8, TMP_10;
    $opal.defs(self, '$new', TMP_1 = function(name, args) {var $zuper = $slice.call(arguments, 0);
      var $a, $b, $c, TMP_2, self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_1._p = null;
      if (($a = self['$==']($opalScope.Struct)) === false || $a === nil) {
        return $opal.find_super_dispatcher(self, 'new', TMP_1, $iter, $Struct).apply(self, $zuper)};
      if (name['$[]'](0)['$=='](name['$[]'](0).$upcase())) {
        return $opalScope.Struct.$const_set(name, ($a = self).$new.apply($a, [].concat(args)))
        } else {
        args.$unshift(name);
        return ($b = ($c = $opalScope.Class).$new, $b._p = (TMP_2 = function(){var self = TMP_2._s || this, $a, $b, TMP_3, $c;
        ($a = ($b = args).$each, $a._p = (TMP_3 = function(arg){var self = TMP_3._s || this;if (arg == null) arg = nil;
          return self.$define_struct_attribute(arg)}, TMP_3._s = self, TMP_3), $a).call($b);
          if (block !== false && block !== nil) {
            return ($a = ($c = self).$instance_eval, $a._p = block.$to_proc(), $a).call($c)
            } else {
            return nil
          };}, TMP_2._s = self, TMP_2), $b).call($c, self);
      };
    });

    $opal.defs(self, '$define_struct_attribute', function(name) {
      var $a, $b, TMP_4, $c, TMP_5, self = this;
      if (self['$==']($opalScope.Struct)) {
        self.$raise($opalScope.ArgumentError, "you cannot define attributes to the Struct class")};
      self.$members()['$<<'](name);
      ($a = ($b = self).$define_method, $a._p = (TMP_4 = function(){var self = TMP_4._s || this;
      return self.$instance_variable_get("@" + (name))}, TMP_4._s = self, TMP_4), $a).call($b, name);
      return ($a = ($c = self).$define_method, $a._p = (TMP_5 = function(value){var self = TMP_5._s || this;if (value == null) value = nil;
      return self.$instance_variable_set("@" + (name), value)}, TMP_5._s = self, TMP_5), $a).call($c, "" + (name) + "=");
    });

    $opal.defs(self, '$members', function() {
      var $a, self = this;
      if (self.members == null) self.members = nil;

      if (self['$==']($opalScope.Struct)) {
        self.$raise($opalScope.ArgumentError, "the Struct class has no members")};
      return ((($a = self.members) !== false && $a !== nil) ? $a : self.members = []);
    });

    $opal.defs(self, '$inherited', function(klass) {
      var $a, $b, TMP_6, self = this, members = nil;
      if (self.members == null) self.members = nil;

      if (self['$==']($opalScope.Struct)) {
        return nil};
      members = self.members;
      return ($a = ($b = klass).$instance_eval, $a._p = (TMP_6 = function(){var self = TMP_6._s || this;
      return self.members = members}, TMP_6._s = self, TMP_6), $a).call($b);
    });

    self.$include($opalScope.Enumerable);

    def.$initialize = function(args) {
      var $a, $b, TMP_7, self = this;
      args = $slice.call(arguments, 0);
      return ($a = ($b = self.$members()).$each_with_index, $a._p = (TMP_7 = function(name, index){var self = TMP_7._s || this;if (name == null) name = nil;if (index == null) index = nil;
      return self.$instance_variable_set("@" + (name), args['$[]'](index))}, TMP_7._s = self, TMP_7), $a).call($b);
    };

    def.$members = function() {
      var self = this;
      return self.$class().$members();
    };

    def['$[]'] = function(name) {
      var $a, self = this;
      if (($a = $opalScope.Integer['$==='](name)) !== false && $a !== nil) {
        if (name['$>='](self.$members().$size())) {
          self.$raise($opalScope.IndexError, "offset " + (name) + " too large for struct(size:" + (self.$members().$size()) + ")")};
        name = self.$members()['$[]'](name);
      } else if (($a = self.$members()['$include?'](name.$to_sym())) === false || $a === nil) {
        self.$raise($opalScope.NameError, "no member '" + (name) + "' in struct")};
      return self.$instance_variable_get("@" + (name));
    };

    def['$[]='] = function(name, value) {
      var $a, self = this;
      if (($a = $opalScope.Integer['$==='](name)) !== false && $a !== nil) {
        if (name['$>='](self.$members().$size())) {
          self.$raise($opalScope.IndexError, "offset " + (name) + " too large for struct(size:" + (self.$members().$size()) + ")")};
        name = self.$members()['$[]'](name);
      } else if (($a = self.$members()['$include?'](name.$to_sym())) === false || $a === nil) {
        self.$raise($opalScope.NameError, "no member '" + (name) + "' in struct")};
      return self.$instance_variable_set("@" + (name), value);
    };

    def.$each = TMP_8 = function() {
      var $a, $b, TMP_9, self = this, $iter = TMP_8._p, $yield = $iter || nil;
      TMP_8._p = null;
      if ($yield === nil) {
        return self.$enum_for("each")};
      return ($a = ($b = self.$members()).$each, $a._p = (TMP_9 = function(name){var self = TMP_9._s || this, $a;if (name == null) name = nil;
      return $a = $opal.$yield1($yield, self['$[]'](name)), $a === $breaker ? $a : $a}, TMP_9._s = self, TMP_9), $a).call($b);
    };

    def.$each_pair = TMP_10 = function() {
      var $a, $b, TMP_11, self = this, $iter = TMP_10._p, $yield = $iter || nil;
      TMP_10._p = null;
      if ($yield === nil) {
        return self.$enum_for("each_pair")};
      return ($a = ($b = self.$members()).$each, $a._p = (TMP_11 = function(name){var self = TMP_11._s || this, $a;if (name == null) name = nil;
      return $a = $opal.$yieldX($yield, [name, self['$[]'](name)]), $a === $breaker ? $a : $a}, TMP_11._s = self, TMP_11), $a).call($b);
    };

    def['$eql?'] = function(other) {
      var $a, $b, $c, TMP_12, self = this;
      return ((($a = self.$hash()['$=='](other.$hash())) !== false && $a !== nil) ? $a : ($b = ($c = other.$each_with_index())['$all?'], $b._p = (TMP_12 = function(object, index){var self = TMP_12._s || this;if (object == null) object = nil;if (index == null) index = nil;
      return self['$[]'](self.$members()['$[]'](index))['$=='](object)}, TMP_12._s = self, TMP_12), $b).call($c));
    };

    def.$length = function() {
      var self = this;
      return self.$members().$length();
    };

    $opal.defn(self, '$size', def.$length);

    def.$to_a = function() {
      var $a, $b, TMP_13, self = this;
      return ($a = ($b = self.$members()).$map, $a._p = (TMP_13 = function(name){var self = TMP_13._s || this;if (name == null) name = nil;
      return self['$[]'](name)}, TMP_13._s = self, TMP_13), $a).call($b);
    };

    $opal.defn(self, '$values', def.$to_a);

    return (def.$inspect = function() {
      var $a, $b, TMP_14, self = this, result = nil;
      result = "#<struct ";
      if (self.$class()['$==']($opalScope.Struct)) {
        result = result['$+']("" + (self.$class().$name()) + " ")};
      result = result['$+'](($a = ($b = self.$each_pair()).$map, $a._p = (TMP_14 = function(name, value){var self = TMP_14._s || this;if (name == null) name = nil;if (value == null) value = nil;
      return "" + (name) + "=" + (value.$inspect())}, TMP_14._s = self, TMP_14), $a).call($b).$join(", "));
      result = result['$+'](">");
      return result;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $module = $opal.module, $gvars = $opal.gvars;
  (function($base, $super) {
    function $IO(){};
    var self = $IO = $klass($base, $super, 'IO', $IO);

    var def = $IO._proto, $opalScope = $IO._scope;
    $opal.cdecl($opalScope, 'SEEK_SET', 0);

    $opal.cdecl($opalScope, 'SEEK_CUR', 1);

    $opal.cdecl($opalScope, 'SEEK_END', 2);

    (function($base) {
      var self = $module($base, 'Writable');

      var def = self._proto, $opalScope = self._scope;
      def['$<<'] = function(string) {
        var self = this;
        self.$write(string);
        return self;
      };

      def.$print = function(args) {
        var $a, $b, TMP_1, self = this;
        args = $slice.call(arguments, 0);
        return self.$write(($a = ($b = args).$map, $a._p = (TMP_1 = function(arg){var self = TMP_1._s || this;if (arg == null) arg = nil;
        return self.$String(arg)}, TMP_1._s = self, TMP_1), $a).call($b).$join($gvars[","]));
      };

      def.$puts = function(args) {
        var $a, $b, TMP_2, self = this;
        args = $slice.call(arguments, 0);
        return self.$write(($a = ($b = args).$map, $a._p = (TMP_2 = function(arg){var self = TMP_2._s || this;if (arg == null) arg = nil;
        return self.$String(arg)}, TMP_2._s = self, TMP_2), $a).call($b).$join($gvars["/"]));
      };
            ;$opal.donate(self, ["$<<", "$print", "$puts"]);
    })(self);

    return (function($base) {
      var self = $module($base, 'Readable');

      var def = self._proto, $opalScope = self._scope;
      def.$readbyte = function() {
        var self = this;
        return self.$getbyte();
      };

      def.$readchar = function() {
        var self = this;
        return self.$getc();
      };

      def.$readline = function(sep) {
        var self = this;
        if (sep == null) {
          sep = $gvars["/"]
        }
        return self.$raise($opalScope.NotImplementedError);
      };

      def.$readpartial = function(integer, outbuf) {
        var self = this;
        if (outbuf == null) {
          outbuf = nil
        }
        return self.$raise($opalScope.NotImplementedError);
      };
            ;$opal.donate(self, ["$readbyte", "$readchar", "$readline", "$readpartial"]);
    })(self);
  })(self, null);
  $opal.cdecl($opalScope, 'STDERR', $gvars["stderr"] = $opalScope.IO.$new());
  $opal.cdecl($opalScope, 'STDIN', $gvars["stdin"] = $opalScope.IO.$new());
  $opal.cdecl($opalScope, 'STDOUT', $gvars["stdout"] = $opalScope.IO.$new());
  $opal.defs($gvars["stdout"], '$puts', function(strs) {
    var $a, self = this;
    strs = $slice.call(arguments, 0);
    
    for (var i = 0; i < strs.length; i++) {
      if (strs[i] instanceof Array) {
        ($a = self).$puts.apply($a, [].concat((strs[i])));
      }
      else {
        console.log((strs[i]).$to_s());
      }
    }
  
    return nil;
  });
  return ($opal.defs($gvars["stderr"], '$puts', function(strs) {
    var $a, self = this;
    strs = $slice.call(arguments, 0);
    
    for (var i = 0; i < strs.length; i++) {
      if (strs[i] instanceof Array) {
        ($a = self).$puts.apply($a, [].concat((strs[i])));
      }
      else {
        console.warn((strs[i]).$to_s());
      }
    }
  
    return nil;
  }), nil);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.defs(self, '$to_s', function() {
    var self = this;
    return "main";
  });
  return ($opal.defs(self, '$include', function(mod) {
    var self = this;
    return $opalScope.Object.$include(mod);
  }), nil);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $range = $opal.range, $hash2 = $opal.hash2, $klass = $opal.klass, $gvars = $opal.gvars;
  (function($base) {
    var self = $module($base, 'Native');

    var def = self._proto, $opalScope = self._scope, TMP_1;
    $opal.defs(self, '$is_a?', function(object, klass) {
      var self = this;
      
      try {
        return object instanceof $opalScope.Native.$try_convert(klass);
      }
      catch (e) {
        return false;
      }
    ;
    });

    $opal.defs(self, '$try_convert', function(value) {
      var self = this;
      
      if (self['$native?'](value)) {
        return value;
      }
      else if (value['$respond_to?']("to_n")) {
        return value.$to_n();
      }
      else {
        return nil;
      }
    ;
    });

    $opal.defs(self, '$convert', function(value) {
      var self = this;
      
      if (self['$native?'](value)) {
        return value;
      }
      else if (value['$respond_to?']("to_n")) {
        return value.$to_n();
      }
      else {
        self.$raise($opalScope.ArgumentError, "the passed value isn't a native");
      }
    ;
    });

    $opal.defs(self, '$call', TMP_1 = function(obj, key, args) {
      var $a, $b, TMP_2, self = this, $iter = TMP_1._p, block = $iter || nil;
      args = $slice.call(arguments, 2);
      TMP_1._p = null;
      
      var prop = obj[key];

      if (prop == null) {
        return nil;
      }
      else if (prop instanceof Function) {
        if (block !== nil) {
          args.push(block);
        }

        args = ($a = ($b = args).$map, $a._p = (TMP_2 = function(value){var self = TMP_2._s || this, $a, native$ = nil;if (value == null) value = nil;
      native$ = self.$try_convert(value);
        if (($a = nil['$==='](native$)) !== false && $a !== nil) {
          return value
          } else {
          return native$
        };}, TMP_2._s = self, TMP_2), $a).call($b);

        return self.$Native(prop.apply(obj, args));
      }
      else if (self['$native?'](prop)) {
        return self.$Native(prop);
      }
      else {
        return prop;
      }
    ;
    });

    (function($base) {
      var self = $module($base, 'Helpers');

      var def = self._proto, $opalScope = self._scope;
      def.$alias_native = function(new$, old, options) {
        var $a, $b, TMP_3, $c, TMP_4, $d, TMP_5, self = this, as = nil;
        if (old == null) {
          old = new$
        }
        if (options == null) {
          options = $hash2([], {})
        }
        if (($a = old['$end_with?']("=")) !== false && $a !== nil) {
          return ($a = ($b = self).$define_method, $a._p = (TMP_3 = function(value){var self = TMP_3._s || this;
            if (self['native'] == null) self['native'] = nil;
if (value == null) value = nil;
          self['native'][old['$[]']($range(0, -2, false))] = $opalScope.Native.$convert(value);
            return value;}, TMP_3._s = self, TMP_3), $a).call($b, new$)
        } else if (($a = as = options['$[]']("as")) !== false && $a !== nil) {
          return ($a = ($c = self).$define_method, $a._p = (TMP_4 = function(args){var self = TMP_4._s || this, block, $a, $b, $c;
            if (self['native'] == null) self['native'] = nil;
args = $slice.call(arguments, 0);
            block = TMP_4._p || nil, TMP_4._p = null;
          if (($a = value = ($b = ($c = $opalScope.Native).$call, $b._p = block.$to_proc(), $b).apply($c, [self['native'], old].concat(args))) !== false && $a !== nil) {
              return as.$new(value.$to_n())
              } else {
              return nil
            }}, TMP_4._s = self, TMP_4), $a).call($c, new$)
          } else {
          return ($a = ($d = self).$define_method, $a._p = (TMP_5 = function(args){var self = TMP_5._s || this, block, $a, $b;
            if (self['native'] == null) self['native'] = nil;
args = $slice.call(arguments, 0);
            block = TMP_5._p || nil, TMP_5._p = null;
          return ($a = ($b = $opalScope.Native).$call, $a._p = block.$to_proc(), $a).apply($b, [self['native'], old].concat(args))}, TMP_5._s = self, TMP_5), $a).call($d, new$)
        };
      }
            ;$opal.donate(self, ["$alias_native"]);
    })(self);

    $opal.defs(self, '$included', function(klass) {
      var self = this;
      return klass.$extend($opalScope.Helpers);
    });

    def.$initialize = function(native$) {
      var $a, self = this;
      if (($a = $opalScope.Kernel['$native?'](native$)) === false || $a === nil) {
        $opalScope.Kernel.$raise($opalScope.ArgumentError, "the passed value isn't native")};
      return self['native'] = native$;
    };

    def.$to_n = function() {
      var self = this;
      if (self['native'] == null) self['native'] = nil;

      return self['native'];
    };
        ;$opal.donate(self, ["$initialize", "$to_n"]);
  })(self);
  (function($base) {
    var self = $module($base, 'Kernel');

    var def = self._proto, $opalScope = self._scope, TMP_6;
    def['$native?'] = function(value) {
      var self = this;
      return value == null || !value._klass;
    };

    def.$Native = function(obj) {
      var $a, self = this;
      if (($a = obj == null) !== false && $a !== nil) {
        return nil
      } else if (($a = self['$native?'](obj)) !== false && $a !== nil) {
        return ($opalScope.Native)._scope.Object.$new(obj)
        } else {
        return obj
      };
    };

    def.$Array = TMP_6 = function(object, args) {
      var $a, $b, self = this, $iter = TMP_6._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_6._p = null;
      
      if (object == null || object === nil) {
        return [];
      }
      else if (self['$native?'](object)) {
        return ($a = ($b = ($opalScope.Native)._scope.Array).$new, $a._p = block.$to_proc(), $a).apply($b, [object].concat(args)).$to_a();
      }
      else if (object['$respond_to?']("to_ary")) {
        return object.$to_ary();
      }
      else if (object['$respond_to?']("to_a")) {
        return object.$to_a();
      }
      else {
        return [object];
      }
    ;
    };
        ;$opal.donate(self, ["$native?", "$Native", "$Array"]);
  })(self);
  (function($base, $super) {
    function $Object(){};
    var self = $Object = $klass($base, $super, 'Object', $Object);

    var def = $Object._proto, $opalScope = $Object._scope, TMP_7, TMP_8, TMP_9, TMP_10;
    def['native'] = nil;
    self.$include($opalScope.Native);

    $opal.defn(self, '$==', function(other) {
      var self = this;
      return self['native'] === $opalScope.Native.$try_convert(other);
    });

    $opal.defn(self, '$has_key?', function(name) {
      var self = this;
      return self['native'].hasOwnProperty(name);
    });

    $opal.defn(self, '$key?', def['$has_key?']);

    $opal.defn(self, '$include?', def['$has_key?']);

    $opal.defn(self, '$member?', def['$has_key?']);

    $opal.defn(self, '$each', TMP_7 = function(args) {
      var $a, self = this, $iter = TMP_7._p, $yield = $iter || nil;
      args = $slice.call(arguments, 0);
      TMP_7._p = null;
      if (($yield !== nil)) {
        
        for (var key in self['native']) {
          ((($a = $opal.$yieldX($yield, [key, self['native'][key]])) === $breaker) ? $breaker.$v : $a)
        }
      ;
        return self;
        } else {
        return ($a = self).$method_missing.apply($a, ["each"].concat(args))
      };
    });

    $opal.defn(self, '$[]', function(key) {
      var $a, self = this;
      
      var prop = self['native'][key];

      if (prop instanceof Function) {
        return prop;
      }
      else {
        return (($a = $opal.Object._scope.Native) == null ? $opal.cm('Native') : $a).$call(self['native'], key)
      }
    ;
    });

    $opal.defn(self, '$[]=', function(key, value) {
      var $a, self = this, native$ = nil;
      native$ = $opalScope.Native.$try_convert(value);
      if (($a = native$ === nil) !== false && $a !== nil) {
        return self['native'][key] = value;
        } else {
        return self['native'][key] = native$;
      };
    });

    $opal.defn(self, '$method_missing', TMP_8 = function(mid, args) {
      var $a, $b, $c, self = this, $iter = TMP_8._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      TMP_8._p = null;
      
      if (mid.charAt(mid.length - 1) === '=') {
        return self['$[]='](mid.$slice(0, mid.$length()['$-'](1)), args['$[]'](0));
      }
      else {
        return ($a = ($b = (($c = $opal.Object._scope.Native) == null ? $opal.cm('Native') : $c)).$call, $a._p = block.$to_proc(), $a).apply($b, [self['native'], mid].concat(args));
      }
    ;
    });

    $opal.defn(self, '$nil?', function() {
      var self = this;
      return false;
    });

    $opal.defn(self, '$is_a?', function(klass) {
      var self = this;
      return klass['$==']($opalScope.Native);
    });

    $opal.defn(self, '$kind_of?', def['$is_a?']);

    $opal.defn(self, '$instance_of?', function(klass) {
      var self = this;
      return klass['$==']($opalScope.Native);
    });

    $opal.defn(self, '$class', function() {
      var self = this;
      return self._klass;
    });

    $opal.defn(self, '$to_a', TMP_9 = function(options) {
      var $a, $b, self = this, $iter = TMP_9._p, block = $iter || nil;
      if (options == null) {
        options = $hash2([], {})
      }
      TMP_9._p = null;
      return ($a = ($b = ($opalScope.Native)._scope.Array).$new, $a._p = block.$to_proc(), $a).call($b, self['native'], options).$to_a();
    });

    $opal.defn(self, '$to_ary', TMP_10 = function(options) {
      var $a, $b, self = this, $iter = TMP_10._p, block = $iter || nil;
      if (options == null) {
        options = $hash2([], {})
      }
      TMP_10._p = null;
      return ($a = ($b = ($opalScope.Native)._scope.Array).$new, $a._p = block.$to_proc(), $a).call($b, self['native'], options);
    });

    return ($opal.defn(self, '$inspect', function() {
      var self = this;
      return "#<Native:" + (String(self['native'])) + ">";
    }), nil);
  })($opalScope.Native, $opalScope.BasicObject);
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = $Array._proto, $opalScope = $Array._scope, TMP_11, TMP_12;
    def.named = def['native'] = def.get = def.block = def.set = def.length = nil;
    self.$include($opalScope.Native);

    self.$include($opalScope.Enumerable);

    def.$initialize = TMP_11 = function(native$, options) {
      var $a, self = this, $iter = TMP_11._p, block = $iter || nil;
      if (options == null) {
        options = $hash2([], {})
      }
      TMP_11._p = null;
      $opal.find_super_dispatcher(self, 'initialize', TMP_11, null).apply(self, [native$]);
      self.get = ((($a = options['$[]']("get")) !== false && $a !== nil) ? $a : options['$[]']("access"));
      self.named = options['$[]']("named");
      self.set = ((($a = options['$[]']("set")) !== false && $a !== nil) ? $a : options['$[]']("access"));
      self.length = ((($a = options['$[]']("length")) !== false && $a !== nil) ? $a : "length");
      self.block = block;
      if (($a = self.$length() == null) !== false && $a !== nil) {
        return self.$raise($opalScope.ArgumentError, "no length found on the array-like object")
        } else {
        return nil
      };
    };

    def.$each = TMP_12 = function() {
      var $a, self = this, $iter = TMP_12._p, block = $iter || nil;
      TMP_12._p = null;
      if (($a = block) === false || $a === nil) {
        return self.$enum_for("each")};
      
      for (var i = 0, length = self.$length(); i < length; i++) {
        var value = $opal.$yield1(block, self['$[]'](i));

        if (value === $breaker) {
          return $breaker.$v;
        }
      }
    ;
      return self;
    };

    def['$[]'] = function(index) {
      var $a, self = this, result = nil, $case = nil;
      result = (function() {$case = index;if ($opalScope.String['$===']($case) || $opalScope.Symbol['$===']($case)) {if (($a = self.named) !== false && $a !== nil) {
        return self['native'][self.named](index);
        } else {
        return self['native'][index];
      }}else if ($opalScope.Integer['$===']($case)) {if (($a = self.get) !== false && $a !== nil) {
        return self['native'][self.get](index);
        } else {
        return self['native'][index];
      }}else { return nil }})();
      if (result !== false && result !== nil) {
        if (($a = self.block) !== false && $a !== nil) {
          return self.block.$call(result)
          } else {
          return self.$Native(result)
        }
        } else {
        return nil
      };
    };

    def['$[]='] = function(index, value) {
      var $a, self = this;
      if (($a = self.set) !== false && $a !== nil) {
        return self['native'][self.set](index, $opalScope.Native.$convert(value));
        } else {
        return self['native'][index] = $opalScope.Native.$convert(value);
      };
    };

    def.$last = function(count) {
      var $a, self = this, index = nil, result = nil;
      if (count == null) {
        count = nil
      }
      if (count !== false && count !== nil) {
        index = self.$length()['$-'](1);
        result = [];
        while (index['$>='](0)) {
        result['$<<'](self['$[]'](index));
        index = index['$-'](1);};
        return result;
        } else {
        return self['$[]'](self.$length()['$-'](1))
      };
    };

    def.$length = function() {
      var self = this;
      return self['native'][self.length];
    };

    def.$to_ary = function() {
      var self = this;
      return self;
    };

    return (def.$inspect = function() {
      var self = this;
      return self.$to_a().$inspect();
    }, nil);
  })($opalScope.Native, null);
  (function($base, $super) {
    function $Numeric(){};
    var self = $Numeric = $klass($base, $super, 'Numeric', $Numeric);

    var def = $Numeric._proto, $opalScope = $Numeric._scope;
    return (def.$to_n = function() {
      var self = this;
      return self.valueOf();
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Proc(){};
    var self = $Proc = $klass($base, $super, 'Proc', $Proc);

    var def = $Proc._proto, $opalScope = $Proc._scope;
    return (def.$to_n = function() {
      var self = this;
      return self;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $String(){};
    var self = $String = $klass($base, $super, 'String', $String);

    var def = $String._proto, $opalScope = $String._scope;
    return (def.$to_n = function() {
      var self = this;
      return self.valueOf();
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Regexp(){};
    var self = $Regexp = $klass($base, $super, 'Regexp', $Regexp);

    var def = $Regexp._proto, $opalScope = $Regexp._scope;
    return (def.$to_n = function() {
      var self = this;
      return self.valueOf();
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $MatchData(){};
    var self = $MatchData = $klass($base, $super, 'MatchData', $MatchData);

    var def = $MatchData._proto, $opalScope = $MatchData._scope;
    def.matches = nil;
    return (def.$to_n = function() {
      var self = this;
      return self.matches;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Struct(){};
    var self = $Struct = $klass($base, $super, 'Struct', $Struct);

    var def = $Struct._proto, $opalScope = $Struct._scope;
    def.$initialize = function(args) {
      var $a, $b, TMP_13, $c, TMP_14, self = this, object = nil;
      args = $slice.call(arguments, 0);
      if (($a = (($b = args.$length()['$=='](1)) ? self['$native?'](args['$[]'](0)) : $b)) !== false && $a !== nil) {
        object = args['$[]'](0);
        return ($a = ($b = self.$members()).$each, $a._p = (TMP_13 = function(name){var self = TMP_13._s || this;if (name == null) name = nil;
        return self.$instance_variable_set("@" + (name), self.$Native(object[name]))}, TMP_13._s = self, TMP_13), $a).call($b);
        } else {
        return ($a = ($c = self.$members()).$each_with_index, $a._p = (TMP_14 = function(name, index){var self = TMP_14._s || this;if (name == null) name = nil;if (index == null) index = nil;
        return self.$instance_variable_set("@" + (name), args['$[]'](index))}, TMP_14._s = self, TMP_14), $a).call($c)
      };
    };

    return (def.$to_n = function() {
      var $a, $b, TMP_15, self = this, result = nil;
      result = {};
      ($a = ($b = self).$each_pair, $a._p = (TMP_15 = function(name, value){var self = TMP_15._s || this;if (name == null) name = nil;if (value == null) value = nil;
      return result[name] = value.$to_n();}, TMP_15._s = self, TMP_15), $a).call($b);
      return result;
    }, nil);
  })(self, null);
  (function($base, $super) {
    function $Array(){};
    var self = $Array = $klass($base, $super, 'Array', $Array);

    var def = $Array._proto, $opalScope = $Array._scope;
    return (def.$to_n = function() {
      var self = this;
      
      var result = [];

      for (var i = 0, length = self.length; i < length; i++) {
        var obj = self[i];

        if ((obj)['$respond_to?']("to_n")) {
          result.push((obj).$to_n());
        }
        else {
          result.push(obj);
        }
      }

      return result;
    ;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Boolean(){};
    var self = $Boolean = $klass($base, $super, 'Boolean', $Boolean);

    var def = $Boolean._proto, $opalScope = $Boolean._scope;
    return (def.$to_n = function() {
      var self = this;
      return self.valueOf();
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Time(){};
    var self = $Time = $klass($base, $super, 'Time', $Time);

    var def = $Time._proto, $opalScope = $Time._scope;
    return (def.$to_n = function() {
      var self = this;
      return self;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $NilClass(){};
    var self = $NilClass = $klass($base, $super, 'NilClass', $NilClass);

    var def = $NilClass._proto, $opalScope = $NilClass._scope;
    return (def.$to_n = function() {
      var self = this;
      return null;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Hash(){};
    var self = $Hash = $klass($base, $super, 'Hash', $Hash);

    var def = $Hash._proto, $opalScope = $Hash._scope, TMP_16;
    def.$initialize = TMP_16 = function(defaults) {
      var self = this, $iter = TMP_16._p, block = $iter || nil;
      TMP_16._p = null;
      
      if (defaults != null) {
        if (defaults.constructor === Object) {
          var map  = self.map,
              keys = self.keys;

          for (var key in defaults) {
            var value = defaults[key];

            if (value && value.constructor === Object) {
              map[key] = $opalScope.Hash.$new(value);
            }
            else {
              map[key] = self.$Native(defaults[key]);
            }

            keys.push(key);
          }
        }
        else {
          self.none = defaults;
        }
      }
      else if (block !== nil) {
        self.proc = block;
      }

      return self;
    
    };

    return (def.$to_n = function() {
      var self = this;
      
      var result = {},
          keys   = self.keys,
          map    = self.map,
          bucket,
          value;

      for (var i = 0, length = keys.length; i < length; i++) {
        var key = keys[i],
            obj = map[key];

        if ((obj)['$respond_to?']("to_n")) {
          result[key] = (obj).$to_n();
        }
        else {
          result[key] = obj;
        }
      }

      return result;
    ;
    }, nil);
  })(self, null);
  (function($base, $super) {
    function $Module(){};
    var self = $Module = $klass($base, $super, 'Module', $Module);

    var def = $Module._proto, $opalScope = $Module._scope;
    return (def.$native_module = function() {
      var self = this;
      return Opal.global[self.$name()] = self;
    }, nil)
  })(self, null);
  (function($base, $super) {
    function $Class(){};
    var self = $Class = $klass($base, $super, 'Class', $Class);

    var def = $Class._proto, $opalScope = $Class._scope;
    def.$native_alias = function(jsid, mid) {
      var self = this;
      return self._proto[jsid] = self._proto['$' + mid];
    };

    return $opal.defn(self, '$native_class', def.$native_module);
  })(self, null);
  return $gvars["$"] = $gvars["global"] = self.$Native(Opal.global);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $gvars = $opal.gvars, $hash2 = $opal.hash2;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  $gvars["&"] = $gvars["~"] = $gvars["`"] = $gvars["'"] = nil;
  $gvars[":"] = [];
  $gvars["\""] = [];
  $gvars["/"] = "\n";
  $gvars[","] = " ";
  $opal.cdecl($opalScope, 'ARGV', []);
  $opal.cdecl($opalScope, 'ARGF', $opalScope.Object.$new());
  $opal.cdecl($opalScope, 'ENV', $hash2([], {}));
  $gvars["VERBOSE"] = false;
  $gvars["DEBUG"] = false;
  $gvars["SAFE"] = 0;
  $opal.cdecl($opalScope, 'RUBY_PLATFORM', "opal");
  $opal.cdecl($opalScope, 'RUBY_ENGINE', "opal");
  $opal.cdecl($opalScope, 'RUBY_VERSION', "1.9.3");
  $opal.cdecl($opalScope, 'RUBY_ENGINE_VERSION', "0.5.5");
  return $opal.cdecl($opalScope, 'RUBY_RELEASE_DATE', "2013-11-25");
})(Opal);

(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $module = $opal.module;
  (function($base, $super) {
    function $Set(){};
    var self = $Set = $klass($base, $super, 'Set', $Set);

    var def = $Set._proto, $opalScope = $Set._scope, TMP_1, TMP_4, TMP_6;
    def.hash = nil;
    self.$include($opalScope.Enumerable);

    $opal.defs(self, '$[]', function(ary) {
      var self = this;
      ary = $slice.call(arguments, 0);
      return self.$new(ary);
    });

    def.$initialize = TMP_1 = function(enum$) {
      var $a, $b, TMP_2, self = this, $iter = TMP_1._p, block = $iter || nil;
      if (enum$ == null) {
        enum$ = nil
      }
      TMP_1._p = null;
      self.hash = $opalScope.Hash.$new();
      if (($a = enum$['$nil?']()) !== false && $a !== nil) {
        return nil};
      if (block !== false && block !== nil) {
        return ($a = ($b = self).$do_with_enum, $a._p = (TMP_2 = function(o){var self = TMP_2._s || this;if (o == null) o = nil;
        return self.$add(block['$[]'](o))}, TMP_2._s = self, TMP_2), $a).call($b, enum$)
        } else {
        return self.$merge(enum$)
      };
    };

    def['$=='] = function(other) {
      var $a, $b, TMP_3, self = this;
      if (($a = self['$equal?'](other)) !== false && $a !== nil) {
        return true
      } else if (($a = other['$instance_of?'](self.$class())) !== false && $a !== nil) {
        return self.hash['$=='](other.$instance_variable_get("@hash"))
      } else if (($a = ($b = other['$is_a?']($opalScope.Set), $b !== false && $b !== nil ?self.$size()['$=='](other.$size()) : $b)) !== false && $a !== nil) {
        return ($a = ($b = other)['$all?'], $a._p = (TMP_3 = function(o){var self = TMP_3._s || this;
          if (self.hash == null) self.hash = nil;
if (o == null) o = nil;
        return self.hash['$include?'](o)}, TMP_3._s = self, TMP_3), $a).call($b)
        } else {
        return false
      };
    };

    def.$add = function(o) {
      var self = this;
      self.hash['$[]='](o, true);
      return self;
    };

    $opal.defn(self, '$<<', def.$add);

    def['$add?'] = function(o) {
      var $a, self = this;
      if (($a = self['$include?'](o)) !== false && $a !== nil) {
        return nil
        } else {
        return self.$add(o)
      };
    };

    def.$each = TMP_4 = function() {
      var $a, $b, self = this, $iter = TMP_4._p, block = $iter || nil;
      TMP_4._p = null;
      if (block === nil) {
        return self.$enum_for("each")};
      ($a = ($b = self.hash).$each_key, $a._p = block.$to_proc(), $a).call($b);
      return self;
    };

    def['$empty?'] = function() {
      var self = this;
      return self.hash['$empty?']();
    };

    def.$clear = function() {
      var self = this;
      self.hash.$clear();
      return self;
    };

    def['$include?'] = function(o) {
      var self = this;
      return self.hash['$include?'](o);
    };

    $opal.defn(self, '$member?', def['$include?']);

    def.$merge = function(enum$) {
      var $a, $b, TMP_5, self = this;
      ($a = ($b = self).$do_with_enum, $a._p = (TMP_5 = function(o){var self = TMP_5._s || this;if (o == null) o = nil;
      return self.$add(o)}, TMP_5._s = self, TMP_5), $a).call($b, enum$);
      return self;
    };

    def.$do_with_enum = TMP_6 = function(enum$) {
      var $a, $b, self = this, $iter = TMP_6._p, block = $iter || nil;
      TMP_6._p = null;
      return ($a = ($b = enum$).$each, $a._p = block.$to_proc(), $a).call($b);
    };

    def.$size = function() {
      var self = this;
      return self.hash.$size();
    };

    $opal.defn(self, '$length', def.$size);

    return (def.$to_a = function() {
      var self = this;
      return self.hash.$keys();
    }, nil);
  })(self, null);
  return (function($base) {
    var self = $module($base, 'Enumerable');

    var def = self._proto, $opalScope = self._scope, TMP_7;
    def.$to_set = TMP_7 = function(klass, args) {
      var $a, $b, self = this, $iter = TMP_7._p, block = $iter || nil;
      args = $slice.call(arguments, 1);
      if (klass == null) {
        klass = $opalScope.Set
      }
      TMP_7._p = null;
      return ($a = ($b = klass).$new, $a._p = block.$to_proc(), $a).apply($b, [self].concat(args));
    }
        ;$opal.donate(self, ["$to_set"]);
  })(self);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $StringScanner(){};
    var self = $StringScanner = $klass($base, $super, 'StringScanner', $StringScanner);

    var def = $StringScanner._proto, $opalScope = $StringScanner._scope;
    def.pos = def.string = def.working = def.prev_pos = def.matched = def.match = nil;
    self.$attr_reader("pos");

    self.$attr_reader("matched");

    def.$initialize = function(string) {
      var self = this;
      self.string = string;
      self.pos = 0;
      self.matched = nil;
      self.working = string;
      return self.match = [];
    };

    def['$bol?'] = function() {
      var self = this;
      return self.pos === 0 || self.string.charAt(self.pos - 1) === "\n";
    };

    def.$scan = function(regex) {
      var self = this;
      
      var regex  = new RegExp('^' + regex.toString().substring(1, regex.toString().length - 1)),
          result = regex.exec(self.working);

      if (result == null) {
        return self.matched = nil;
      }
      else if (typeof(result) === 'object') {
        self.prev_pos = self.pos;
        self.pos      += result[0].length;
        self.working  = self.working.substring(result[0].length);
        self.matched  = result[0];
        self.match    = result;

        return result[0];
      }
      else if (typeof(result) === 'string') {
        self.pos     += result.length;
        self.working  = self.working.substring(result.length);

        return result;
      }
      else {
        return nil;
      }
    ;
    };

    def['$[]'] = function(idx) {
      var self = this;
      
      var match = self.match;

      if (idx < 0) {
        idx += match.length;
      }

      if (idx < 0 || idx >= match.length) {
        return nil;
      }

      return match[idx];
    ;
    };

    def.$check = function(regex) {
      var self = this;
      
      var regexp = new RegExp('^' + regex.toString().substring(1, regex.toString().length - 1)),
          result = regexp.exec(self.working);

      if (result == null) {
        return self.matched = nil;
      }

      return self.matched = result[0];
    ;
    };

    def.$peek = function(length) {
      var self = this;
      return self.working.substring(0, length);
    };

    def['$eos?'] = function() {
      var self = this;
      return self.working.length === 0;
    };

    def.$skip = function(re) {
      var self = this;
      
      re = new RegExp('^' + re.source)
      var result = re.exec(self.working);

      if (result == null) {
        return self.matched = nil;
      }
      else {
        var match_str = result[0];
        var match_len = match_str.length;
        self.matched = match_str;
        self.prev_pos = self.pos;
        self.pos += match_len;
        self.working = self.working.substring(match_len);
        return match_len;
      }
    ;
    };

    def.$get_byte = function() {
      var self = this;
      
      var result = nil;
      if (self.pos < self.string.length) {
        self.prev_pos = self.pos;
        self.pos += 1;
        result = self.matched = self.working.substring(0, 1);
        self.working = self.working.substring(1);
      }
      else {
        self.matched = nil;
      }

      return result;
    ;
    };

    $opal.defn(self, '$getch', def.$get_byte);

    def['$pos='] = function(pos) {
      var self = this;
      
      if (pos < 0) {
        pos += self.string.$length();
      }
    ;
      self.pos = pos;
      return self.working = self.string.slice(pos);
    };

    def.$rest = function() {
      var self = this;
      return self.working;
    };

    def.$terminate = function() {
      var self = this;
      self.match = nil;
      return self['$pos='](self.string.$length());
    };

    return (def.$unscan = function() {
      var self = this;
      self.pos = self.prev_pos;
      self.prev_pos = nil;
      self.match = nil;
      return self;
    }, nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $Dir(){};
    var self = $Dir = $klass($base, $super, 'Dir', $Dir);

    var def = $Dir._proto, $opalScope = $Dir._scope;
    $opal.defs(self, '$pwd', function() {
      var self = this;
      return ".";
    });

    return ($opal.defs(self, '$home', function() {
      var self = this;
      return $opalScope.ENV['$[]']("HOME");
    }), nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass;
  return (function($base, $super) {
    function $SecurityError(){};
    var self = $SecurityError = $klass($base, $super, 'SecurityError', $SecurityError);

    var def = $SecurityError._proto, $opalScope = $SecurityError._scope;
    return nil;
  })(self, $opalScope.Exception)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $range = $opal.range;
  return (function($base, $super) {
    function $File(){};
    var self = $File = $klass($base, $super, 'File', $File);

    var def = $File._proto, $opalScope = $File._scope;
    $opal.cdecl($opalScope, 'SEPARATOR', "/");

    $opal.cdecl($opalScope, 'ALT_SEPARATOR', nil);

    $opal.defs(self, '$expand_path', function(path) {
      var self = this;
      return path;
    });

    $opal.defs(self, '$join', function(paths) {
      var self = this;
      paths = $slice.call(arguments, 0);
      return paths['$*']($opalScope.SEPARATOR);
    });

    $opal.defs(self, '$basename', function(path) {
      var $a, self = this;
      return path['$[]']($range(((((($a = path.$rindex(($opalScope.File)._scope.SEPARATOR)) !== false && $a !== nil) ? $a : -1))['$+'](1)), -1, false));
    });

    $opal.defs(self, '$dirname', function(path) {
      var $a, self = this;
      return path['$[]']($range(0, ((((($a = path.$rindex($opalScope.SEPARATOR)) !== false && $a !== nil) ? $a : 0))['$-'](1)), false));
    });

    return ($opal.defs(self, '$extname', function(path) {
      var $a, self = this, last_dot_idx = nil;
      if (($a = path.$to_s()['$empty?']()) !== false && $a !== nil) {
        return ""};
      last_dot_idx = path['$[]']($range(1, -1, false)).$rindex(".");
      if (($a = last_dot_idx['$nil?']()) !== false && $a !== nil) {
        return ""
        } else {
        return path['$[]']($range((last_dot_idx['$+'](1)), -1, false))
      };
    }), nil);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base) {
      var self = $module($base, 'Debug');

      var def = self._proto, $opalScope = self._scope, TMP_1;
      self.show_debug = nil;

      $opal.defs(self, '$debug', TMP_1 = function() {
        var $a, self = this, $iter = TMP_1._p, $yield = $iter || nil;
        TMP_1._p = null;
        if (($a = self['$show_debug_output?']()) !== false && $a !== nil) {
          return self.$warn(((($a = $opal.$yieldX($yield, [])) === $breaker) ? $breaker.$v : $a))
          } else {
          return nil
        };
      });

      $opal.defs(self, '$set_debug', function(value) {
        var self = this;
        return self.show_debug = value;
      });

      $opal.defs(self, '$show_debug_output?', function() {
        var $a, $b, $c, self = this;
        if (self.show_debug == null) self.show_debug = nil;

        return ((($a = self.show_debug) !== false && $a !== nil) ? $a : ((($b = $opalScope.ENV['$[]']("DEBUG")['$==']("true")) ? ($c = $opalScope.ENV['$[]']("SUPPRESS_DEBUG")['$==']("true"), ($c === nil || $c === false)) : $b)));
      });

      $opal.defs(self, '$puts_indented', function(level, args) {
        var $a, $b, TMP_2, self = this, indentation = nil;
        args = $slice.call(arguments, 1);
        indentation = " "['$*'](level)['$*'](2);
        return ($a = ($b = args).$each, $a._p = (TMP_2 = function(arg){var self = TMP_2._s || this, $a, $b, TMP_3;if (arg == null) arg = nil;
        return ($a = ($b = self).$debug, $a._p = (TMP_3 = function(){var self = TMP_3._s || this;
          return "" + (indentation) + (arg)}, TMP_3._s = self, TMP_3), $a).call($b)}, TMP_2._s = self, TMP_2), $a).call($b);
      });
      
    })(self)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    $opal.cdecl($opalScope, 'VERSION', "1.5.0.preview.1")
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $range = $opal.range, $gvars = $opal.gvars;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base) {
      var self = $module($base, 'Helpers');

      var def = self._proto, $opalScope = self._scope;
      $opal.defs(self, '$require_library', function(name, gem) {
        var $a, self = this, e = nil;
        if (gem == null) {
          gem = true
        }
        try {
        return true
        } catch ($err) {if ($opalScope.LoadError['$===']($err)) {e = $err;
          if (gem !== false && gem !== nil) {
            return self.$fail("asciidoctor: FAILED: required gem '" + ((function() {if (($a = gem['$==='](true)) !== false && $a !== nil) {
              return name
              } else {
              return gem
            }; return nil; })()) + "' is not installed. Processing aborted.")
            } else {
            return self.$fail("asciidoctor: FAILED: " + (e.$message().$chomp(".")) + ". Processing aborted.")
          }
          }else { throw $err; }
        };
      });

      $opal.defs(self, '$normalize_lines', function(data) {
        var $a, self = this;
        if (data.$class()['$==']((($a = $opal.Object._scope.String) == null ? $opal.cm('String') : $a))) {
          return (self.$normalize_lines_from_string(data))
          } else {
          return (self.$normalize_lines_array(data))
        };
      });

      $opal.defs(self, '$normalize_lines_array', function(data) {
        var $a, $b, TMP_1, $c, TMP_2, $d, TMP_3, $e, TMP_4, self = this, utf8 = nil, leading_bytes = nil, first_line = nil, leading_2_bytes = nil;
        if (($a = data.$size()['$>'](0)) === false || $a === nil) {
          return []};
        if (($a = $opalScope.COERCE_ENCODING) !== false && $a !== nil) {
          utf8 = ((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_8;
          leading_bytes = (function() {if (($a = (first_line = data.$first())) !== false && $a !== nil) {
            return first_line['$[]']($range(0, 2, false)).$bytes().$to_a()
            } else {
            return nil
          }; return nil; })();
          if (((leading_2_bytes = leading_bytes['$[]']($range(0, 1, false))))['$==']($opalScope.BOM_BYTES_UTF_16LE)) {
            return ($a = ($b = ((data.$join().$force_encoding(((($c = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $c))._scope.UTF_16LE))['$[]']($range(1, -1, false)).$encode(utf8)).$lines()).$map, $a._p = (TMP_1 = function(line){var self = TMP_1._s || this;if (line == null) line = nil;
            return line.$rstrip()}, TMP_1._s = self, TMP_1), $a).call($b)
          } else if (leading_2_bytes['$==']($opalScope.BOM_BYTES_UTF_16BE)) {
            data['$[]='](0, (first_line.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_16BE))['$[]']($range(1, -1, false)));
            return ($a = ($c = data).$map, $a._p = (TMP_2 = function(line){var self = TMP_2._s || this, $a;if (line == null) line = nil;
            return "" + (((line.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_16BE)).$encode(utf8)).$rstrip())}, TMP_2._s = self, TMP_2), $a).call($c);
          } else if (leading_bytes['$[]']($range(0, 2, false))['$==']($opalScope.BOM_BYTES_UTF_8)) {
            data['$[]='](0, (first_line.$force_encoding(utf8))['$[]']($range(1, -1, false)))};
          return ($a = ($d = data).$map, $a._p = (TMP_3 = function(line){var self = TMP_3._s || this;if (line == null) line = nil;
          if (line.$encoding()['$=='](utf8)) {
              return line.$rstrip()
              } else {
              return (line.$force_encoding(utf8)).$rstrip()
            }}, TMP_3._s = self, TMP_3), $a).call($d);
          } else {
          if (($a = ($e = (first_line = data.$first()), $e !== false && $e !== nil ?first_line['$[]']($range(0, 2, false)).$bytes().$to_a()['$==']($opalScope.BOM_BYTES_UTF_8) : $e)) !== false && $a !== nil) {
            data['$[]='](0, first_line['$[]']($range(3, -1, false)))};
          return ($a = ($e = data).$map, $a._p = (TMP_4 = function(line){var self = TMP_4._s || this;if (line == null) line = nil;
          return line.$rstrip()}, TMP_4._s = self, TMP_4), $a).call($e);
        };
      });

      $opal.defs(self, '$normalize_lines_from_string', function(data) {
        var $a, $b, TMP_5, self = this, utf8 = nil, leading_bytes = nil, leading_2_bytes = nil;
        if (($a = ((($b = data['$nil?']()) !== false && $b !== nil) ? $b : data['$=='](""))) !== false && $a !== nil) {
          return []};
        if (($a = $opalScope.COERCE_ENCODING) !== false && $a !== nil) {
          utf8 = ((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_8;
          leading_bytes = data['$[]']($range(0, 2, false)).$bytes().$to_a();
          if (((leading_2_bytes = leading_bytes['$[]']($range(0, 1, false))))['$==']($opalScope.BOM_BYTES_UTF_16LE)) {
            data = (data.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_16LE))['$[]']($range(1, -1, false)).$encode(utf8)
          } else if (leading_2_bytes['$==']($opalScope.BOM_BYTES_UTF_16BE)) {
            data = (data.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_16BE))['$[]']($range(1, -1, false)).$encode(utf8)
          } else if (leading_bytes['$[]']($range(0, 2, false))['$==']($opalScope.BOM_BYTES_UTF_8)) {
            data = (function() {if (data.$encoding()['$=='](utf8)) {
              return data['$[]']($range(1, -1, false))
              } else {
              return (data.$force_encoding(utf8))['$[]']($range(1, -1, false))
            }; return nil; })()
          } else if (($a = data.$encoding()['$=='](utf8)) === false || $a === nil) {
            data = data.$force_encoding(utf8)};
        } else if (data['$[]']($range(0, 2, false)).$bytes().$to_a()['$==']($opalScope.BOM_BYTES_UTF_8)) {
          data = data['$[]']($range(3, -1, false))};
        return ($a = ($b = data.$each_line()).$map, $a._p = (TMP_5 = function(line){var self = TMP_5._s || this;if (line == null) line = nil;
        return line.$rstrip()}, TMP_5._s = self, TMP_5), $a).call($b);
      });

      $opal.defs(self, '$encode_uri', function(str) {
        var $a, $b, TMP_6, self = this;
        return ($a = ($b = str).$gsub, $a._p = (TMP_6 = function(){var self = TMP_6._s || this, $a, $b, TMP_7;
        return ($a = ($b = $gvars["&"].$each_byte()).$map, $a._p = (TMP_7 = function(c){var self = TMP_7._s || this;if (c == null) c = nil;
          return self.$sprintf("%%%02X", c)}, TMP_7._s = self, TMP_7), $a).call($b).$join()}, TMP_6._s = self, TMP_6), $a).call($b, $opalScope.REGEXP['$[]']("uri_encode_chars"));
      });

      $opal.defs(self, '$rootname', function(file_name) {
        var $a, self = this, ext = nil;
        ext = $opalScope.File.$extname(file_name);
        if (($a = ext['$empty?']()) !== false && $a !== nil) {
          return file_name
          } else {
          return file_name['$[]']($range(0, ext.$length()['$-@'](), true))
        };
      });

      $opal.defs(self, '$mkdir_p', function(dir) {
        var $a, $b, $c, self = this, parent_dir = nil;
        if (($a = $opalScope.File['$directory?'](dir)) !== false && $a !== nil) {
          return nil
          } else {
          parent_dir = $opalScope.File.$dirname(dir);
          if (($a = ($b = ($c = $opalScope.File['$directory?'](parent_dir = $opalScope.File.$dirname(dir)), ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = parent_dir['$==']("."), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
            self.$mkdir_p(parent_dir)};
          return $opalScope.Dir.$mkdir(dir);
        };
      });

      $opal.defs(self, '$clone_options', function(opts) {
        var $a, self = this, clone = nil;
        clone = opts.$dup();
        if (($a = opts['$has_key?']("attributes")) !== false && $a !== nil) {
          clone['$[]=']("attributes", opts['$[]']("attributes").$dup())};
        return clone;
      });
      
    })(self)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $hash2 = $opal.hash2, $gvars = $opal.gvars, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base) {
      var self = $module($base, 'Substitutors');

      var def = self._proto, $opalScope = self._scope;
      $opal.cdecl($opalScope, 'SUBS', $hash2(["basic", "normal", "verbatim", "title", "header", "pass"], {"basic": ["specialcharacters"], "normal": ["specialcharacters", "quotes", "attributes", "replacements", "macros", "post_replacements"], "verbatim": ["specialcharacters", "callouts"], "title": ["specialcharacters", "quotes", "replacements", "macros", "attributes", "post_replacements"], "header": ["specialcharacters", "attributes"], "pass": []}));

      $opal.cdecl($opalScope, 'COMPOSITE_SUBS', $hash2(["none", "normal", "verbatim", "specialchars"], {"none": [], "normal": $opalScope.SUBS['$[]']("normal"), "verbatim": $opalScope.SUBS['$[]']("verbatim"), "specialchars": ["specialcharacters"]}));

      $opal.cdecl($opalScope, 'SUB_SYMBOLS', $hash2(["a", "m", "n", "p", "q", "r", "c", "v"], {"a": "attributes", "m": "macros", "n": "normal", "p": "post_replacements", "q": "quotes", "r": "replacements", "c": "specialcharacters", "v": "verbatim"}));

      $opal.cdecl($opalScope, 'SUB_OPTIONS', $hash2(["block", "inline"], {"block": $opalScope.COMPOSITE_SUBS.$keys()['$+']($opalScope.SUBS['$[]']("normal"))['$+'](["callouts"]), "inline": $opalScope.COMPOSITE_SUBS.$keys()['$+']($opalScope.SUBS['$[]']("normal"))}));

      self.$attr_reader("passthroughs");

      def.$apply_subs = function(source, subs, expand) {
        var $a, $b, TMP_1, $c, TMP_2, self = this, effective_subs = nil, multiline = nil, text = nil, has_passthroughs = nil;
        if (subs == null) {
          subs = "normal"
        }
        if (expand == null) {
          expand = false
        }
        if (subs['$==']("normal")) {
          subs = $opalScope.SUBS['$[]']("normal")
        } else if (($a = subs['$nil?']()) !== false && $a !== nil) {
          return source
        } else if (expand !== false && expand !== nil) {
          if (($a = subs['$is_a?']($opalScope.Symbol)) !== false && $a !== nil) {
            subs = ((($a = $opalScope.COMPOSITE_SUBS['$[]'](subs)) !== false && $a !== nil) ? $a : [subs])
            } else {
            effective_subs = [];
            ($a = ($b = subs).$each, $a._p = (TMP_1 = function(key){var self = TMP_1._s || this, $a;if (key == null) key = nil;
            if (($a = $opalScope.COMPOSITE_SUBS['$has_key?'](key)) !== false && $a !== nil) {
                return effective_subs = effective_subs['$+']($opalScope.COMPOSITE_SUBS['$[]'](key))
                } else {
                return effective_subs['$<<'](key)
              }}, TMP_1._s = self, TMP_1), $a).call($b);
            subs = effective_subs;
          }};
        if (($a = subs['$empty?']()) !== false && $a !== nil) {
          return source};
        multiline = source['$is_a?']((($a = $opal.Object._scope.Array) == null ? $opal.cm('Array') : $a));
        text = (function() {if (multiline !== false && multiline !== nil) {
          return (source['$*']($opalScope.EOL))
          } else {
          return source
        }; return nil; })();
        if (($a = (has_passthroughs = subs['$include?']("macros"))) !== false && $a !== nil) {
          text = self.$extract_passthroughs(text)};
        ($a = ($c = subs).$each, $a._p = (TMP_2 = function(type){var self = TMP_2._s || this, $a, $case = nil;if (type == null) type = nil;
        return (function() {$case = type;if ("specialcharacters"['$===']($case)) {return text = self.$sub_specialcharacters(text)}else if ("quotes"['$===']($case)) {return text = self.$sub_quotes(text)}else if ("attributes"['$===']($case)) {return text = self.$sub_attributes(text.$split($opalScope.LINE_SPLIT))['$*']($opalScope.EOL)}else if ("replacements"['$===']($case)) {return text = self.$sub_replacements(text)}else if ("macros"['$===']($case)) {return text = self.$sub_macros(text)}else if ("highlight"['$===']($case)) {return text = self.$highlight_source(text, (subs['$include?']("callouts")))}else if ("callouts"['$===']($case)) {if (($a = subs['$include?']("highlight")) !== false && $a !== nil) {
            return nil
            } else {
            return text = self.$sub_callouts(text)
          }}else if ("post_replacements"['$===']($case)) {return text = self.$sub_post_replacements(text)}else {return self.$warn("asciidoctor: WARNING: unknown substitution type " + (type))}})()}, TMP_2._s = self, TMP_2), $a).call($c);
        if (has_passthroughs !== false && has_passthroughs !== nil) {
          text = self.$restore_passthroughs(text)};
        if (multiline !== false && multiline !== nil) {
          return (text.$split($opalScope.LINE_SPLIT))
          } else {
          return text
        };
      };

      def.$apply_normal_subs = function(lines) {
        var $a, $b, self = this;
        return self.$apply_subs((function() {if (($a = lines['$is_a?']((($b = $opal.Object._scope.Array) == null ? $opal.cm('Array') : $b))) !== false && $a !== nil) {
          return (lines['$*']($opalScope.EOL))
          } else {
          return lines
        }; return nil; })());
      };

      def.$apply_title_subs = function(title) {
        var self = this;
        return self.$apply_subs(title, $opalScope.SUBS['$[]']("title"));
      };

      def.$apply_header_subs = function(text) {
        var self = this;
        return self.$apply_subs(text, $opalScope.SUBS['$[]']("header"));
      };

      def.$extract_passthroughs = function(text) {
        var $a, $b, $c, TMP_3, TMP_4, $d, TMP_5, self = this;
        if (($a = ((($b = ((($c = (text['$include?']("+++"))) !== false && $c !== nil) ? $c : (text['$include?']("$$")))) !== false && $b !== nil) ? $b : (text['$include?']("pass:")))) !== false && $a !== nil) {
          text = ($a = ($b = text).$gsub, $a._p = (TMP_3 = function(){var self = TMP_3._s || this, $a, $b, m = nil, subslist = nil, subs = nil, index = nil;
            if (self.passthroughs == null) self.passthroughs = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            if (($a = ($b = ((text = m['$[]'](4)))['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              text = self.$unescape_brackets(text);
              if (($a = ($b = ((subslist = m['$[]'](3).$to_s()))['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                subs = self.$resolve_pass_subs(subslist)
                } else {
                subs = []
              };
              } else {
              text = m['$[]'](2);
              subs = ((function() {if (m['$[]'](1)['$==']("$$")) {
                return ["specialcharacters"]
                } else {
                return []
              }; return nil; })());
            };
            self.passthroughs['$<<']($hash2(["text", "subs"], {"text": text, "subs": subs}));
            index = self.passthroughs.$size()['$-'](1);
            return "" + ($opalScope.PASS_PLACEHOLDER['$[]']("start")) + (index) + ($opalScope.PASS_PLACEHOLDER['$[]']("end"));}, TMP_3._s = self, TMP_3), $a).call($b, $opalScope.REGEXP['$[]']("pass_macro"))};
        if (($a = (text['$include?']("`"))) !== false && $a !== nil) {
          text = ($a = ($c = text).$gsub, $a._p = (TMP_4 = function(){var self = TMP_4._s || this, $a, $b, $c, m = nil, unescaped_attrs = nil, attributes = nil, index = nil;
            if (self.passthroughs == null) self.passthroughs = nil;

          m = $gvars["~"];
            unescaped_attrs = nil;
            if (($a = m['$[]'](3)['$start_with?']("\\")) !== false && $a !== nil) {
              return (function() {if (($a = m['$[]'](2)['$nil?']()) !== false && $a !== nil) {
                return "" + (m['$[]'](1)) + (m['$[]'](3)['$[]']($range(1, -1, false)))
                } else {
                return "" + (m['$[]'](1)) + "[" + (m['$[]'](2)) + "]" + (m['$[]'](3)['$[]']($range(1, -1, false)))
              }; return nil; })();
            } else if (($a = (($b = m['$[]'](1)['$==']("\\")) ? ($c = m['$[]'](2)['$nil?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
              unescaped_attrs = "[" + (m['$[]'](2)) + "]"};
            if (($a = ($b = unescaped_attrs['$nil?'](), $b !== false && $b !== nil ?($c = m['$[]'](2)['$nil?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
              attributes = self.$parse_attributes(m['$[]'](2))
              } else {
              attributes = $hash2([], {})
            };
            self.passthroughs['$<<']($hash2(["text", "subs", "attributes", "type"], {"text": m['$[]'](4), "subs": ["specialcharacters"], "attributes": attributes, "type": "monospaced"}));
            index = self.passthroughs.$size()['$-'](1);
            return "" + (((($a = unescaped_attrs) !== false && $a !== nil) ? $a : m['$[]'](1))) + ($opalScope.PASS_PLACEHOLDER['$[]']("start")) + (index) + ($opalScope.PASS_PLACEHOLDER['$[]']("end"));}, TMP_4._s = self, TMP_4), $a).call($c, $opalScope.REGEXP['$[]']("pass_lit"))};
        if (($a = (text['$include?']("math:"))) !== false && $a !== nil) {
          text = ($a = ($d = text).$gsub, $a._p = (TMP_5 = function(){var self = TMP_5._s || this, $a, $b, m = nil, type = nil, default_type = nil, subslist = nil, subs = nil, index = nil;
            if (self.document == null) self.document = nil;
            if (self.passthroughs == null) self.passthroughs = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            type = m['$[]'](1).$to_sym();
            if (type['$==']("math")) {
              type = ((function() {if (((default_type = self.$document().$attributes()['$[]']("math").$to_s()))['$==']("")) {
                return "asciimath"
                } else {
                return default_type
              }; return nil; })()).$to_sym()};
            text = self.$unescape_brackets(m['$[]'](3));
            if (($a = ($b = ((subslist = m['$[]'](2).$to_s()))['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              subs = self.$resolve_pass_subs(subslist)
              } else {
              subs = (function() {if (($a = (self.document['$basebackend?']("html"))) !== false && $a !== nil) {
                return ["specialcharacters"]
                } else {
                return []
              }; return nil; })()
            };
            self.passthroughs['$<<']($hash2(["text", "subs", "type"], {"text": text, "subs": subs, "type": type}));
            index = self.passthroughs.$size()['$-'](1);
            return "" + ($opalScope.PASS_PLACEHOLDER['$[]']("start")) + (index) + ($opalScope.PASS_PLACEHOLDER['$[]']("end"));}, TMP_5._s = self, TMP_5), $a).call($d, $opalScope.REGEXP['$[]']("inline_math_macro"))};
        return text;
      };

      def.$restore_passthroughs = function(text) {
        var $a, $b, $c, TMP_6, self = this;
        if (self.passthroughs == null) self.passthroughs = nil;

        if (($a = ((($b = ((($c = self.passthroughs['$nil?']()) !== false && $c !== nil) ? $c : self.passthroughs['$empty?']())) !== false && $b !== nil) ? $b : ($c = text['$include?']($opalScope.PASS_PLACEHOLDER['$[]']("start")), ($c === nil || $c === false)))) !== false && $a !== nil) {
          return text};
        return ($a = ($b = text).$gsub, $a._p = (TMP_6 = function(){var self = TMP_6._s || this, $a, pass = nil, subbed_text = nil;
          if (self.passthroughs == null) self.passthroughs = nil;

        pass = self.passthroughs['$[]']($gvars["~"]['$[]'](1).$to_i());
          subbed_text = self.$apply_subs(pass['$[]']("text"), pass.$fetch("subs", []));
          if (($a = pass['$[]']("type")) !== false && $a !== nil) {
            return $opalScope.Inline.$new(self, "quoted", subbed_text, $hash2(["type", "attributes"], {"type": pass['$[]']("type"), "attributes": pass.$fetch("attributes", $hash2([], {}))})).$render()
            } else {
            return subbed_text
          };}, TMP_6._s = self, TMP_6), $a).call($b, $opalScope.PASS_PLACEHOLDER['$[]']("match"));
      };

      def.$sub_specialcharacters = function(text) {
        var $a, $b, TMP_7, self = this;
        return ($a = ($b = text).$gsub, $a._p = (TMP_7 = function(){var self = TMP_7._s || this;
        return $opalScope.SPECIAL_CHARS['$[]']($gvars["&"])}, TMP_7._s = self, TMP_7), $a).call($b, $opalScope.SPECIAL_CHARS_PATTERN);
      };

      $opal.defn(self, '$sub_specialchars', def.$sub_specialcharacters);

      def.$sub_quotes = function(text) {
        var $a, $b, TMP_8, $c, TMP_10, self = this, result = nil;
        if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) !== false && $a !== nil) {
          result = text;
          ($a = ($b = $opalScope.QUOTE_SUBS).$each, $a._p = (TMP_8 = function(type, scope, pattern){var self = TMP_8._s || this, $a, $b, TMP_9;if (type == null) type = nil;if (scope == null) scope = nil;if (pattern == null) pattern = nil;
          return result = ($a = ($b = result).$gsub, $a._p = (TMP_9 = function(){var self = TMP_9._s || this;
            return self.$transform_quoted_text($gvars["~"], type, scope)}, TMP_9._s = self, TMP_9), $a).call($b, pattern)}, TMP_8._s = self, TMP_8), $a).call($b);
          } else {
          result = text.$dup();
          ($a = ($c = $opalScope.QUOTE_SUBS).$each, $a._p = (TMP_10 = function(type, scope, pattern){var self = TMP_10._s || this, $a, $b, TMP_11;if (type == null) type = nil;if (scope == null) scope = nil;if (pattern == null) pattern = nil;
          return ($a = ($b = result)['$gsub!'], $a._p = (TMP_11 = function(){var self = TMP_11._s || this;
            return self.$transform_quoted_text($gvars["~"], type, scope)}, TMP_11._s = self, TMP_11), $a).call($b, pattern)}, TMP_10._s = self, TMP_10), $a).call($c);
        };
        return result;
      };

      def.$sub_replacements = function(text) {
        var $a, $b, TMP_12, $c, TMP_14, self = this, result = nil;
        if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) !== false && $a !== nil) {
          result = text;
          ($a = ($b = $opalScope.REPLACEMENTS).$each, $a._p = (TMP_12 = function(pattern, replacement, restore){var self = TMP_12._s || this, $a, $b, TMP_13;if (pattern == null) pattern = nil;if (replacement == null) replacement = nil;if (restore == null) restore = nil;
          return result = ($a = ($b = result).$gsub, $a._p = (TMP_13 = function(){var self = TMP_13._s || this;
            return self.$do_replacement($gvars["~"], replacement, restore)}, TMP_13._s = self, TMP_13), $a).call($b, pattern)}, TMP_12._s = self, TMP_12), $a).call($b);
          } else {
          result = text.$dup();
          ($a = ($c = $opalScope.REPLACEMENTS).$each, $a._p = (TMP_14 = function(pattern, replacement, restore){var self = TMP_14._s || this, $a, $b, TMP_15;if (pattern == null) pattern = nil;if (replacement == null) replacement = nil;if (restore == null) restore = nil;
          return ($a = ($b = result)['$gsub!'], $a._p = (TMP_15 = function(){var self = TMP_15._s || this;
            return self.$do_replacement($gvars["~"], replacement, restore)}, TMP_15._s = self, TMP_15), $a).call($b, pattern)}, TMP_14._s = self, TMP_14), $a).call($c);
        };
        return result;
      };

      def.$do_replacement = function(m, replacement, restore) {
        var $a, self = this, matched = nil, $case = nil;
        if (($a = ((matched = m['$[]'](0)))['$include?']("\\")) !== false && $a !== nil) {
          return matched.$tr("\\", "")
          } else {
          return (function() {$case = restore;if ("none"['$===']($case)) {return replacement}else if ("leading"['$===']($case)) {return "" + (m['$[]'](1)) + (replacement)}else if ("bounding"['$===']($case)) {return "" + (m['$[]'](1)) + (replacement) + (m['$[]'](2))}else { return nil }})()
        };
      };

      def.$sub_attributes = function(data, opts) {
        var $a, $b, TMP_16, self = this, string_data = nil, lines = nil, result = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = ((($b = data['$nil?']()) !== false && $b !== nil) ? $b : data['$empty?']())) !== false && $a !== nil) {
          return data};
        string_data = data['$is_a?']($opalScope.String);
        lines = (function() {if (string_data !== false && string_data !== nil) {
          return [data]
          } else {
          return data
        }; return nil; })();
        result = [];
        ($a = ($b = lines).$each, $a._p = (TMP_16 = function(line){var self = TMP_16._s || this, $a, $b, TMP_17, $c, $d, reject = nil, reject_if_empty = nil;if (line == null) line = nil;
        reject = false;
          reject_if_empty = false;
          if (($a = line['$include?']("{")) !== false && $a !== nil) {
            line = ($a = ($b = line).$gsub, $a._p = (TMP_17 = function(){var self = TMP_17._s || this, $a, $b, TMP_18, $c, TMP_19, m = nil, directive = nil, offset = nil, expr = nil, $case = nil, args = nil, _ = nil, value = nil, val = nil, key = nil;
              if (self.document == null) self.document = nil;

            m = $gvars["~"];
              if (($a = ((($b = m['$[]'](1)['$==']("\\")) !== false && $b !== nil) ? $b : m['$[]'](4)['$==']("\\"))) !== false && $a !== nil) {
                return "{" + (m['$[]'](2)) + "}"
              } else if (($a = ($b = ((directive = m['$[]'](3))).$to_s()['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                offset = directive.$length()['$+'](1);
                expr = m['$[]'](2)['$[]']($range(offset, -1, false));
                return (function() {$case = directive;if ("set"['$===']($case)) {args = expr.$split(":");
                $a = $opal.to_ary($opalScope.Lexer.$store_attribute(args['$[]'](0), ((($b = args['$[]'](1)) !== false && $b !== nil) ? $b : ""), self.document)), _ = ($a[0] == null ? nil : $a[0]), value = ($a[1] == null ? nil : $a[1]);
                if (($a = value['$nil?']()) !== false && $a !== nil) {
                  if (self.document.$attributes().$fetch("attribute-undefined", $opalScope.Compliance.$attribute_undefined())['$==']("drop-line")) {
                    ($a = ($b = $opalScope.Debug).$debug, $a._p = (TMP_18 = function(){var self = TMP_18._s || this;
                    return "Undefining attribute: " + (self.$key()) + ", line marked for removal"}, TMP_18._s = self, TMP_18), $a).call($b);
                    reject = true;
                    return ($breaker.$v = "", $breaker);}};
                reject_if_empty = true;
                return "";}else if ("counter"['$===']($case) || "counter2"['$===']($case)) {args = expr.$split(":");
                val = self.document.$counter(args['$[]'](0), args['$[]'](1));
                if (directive['$==']("counter2")) {
                  reject_if_empty = true;
                  return "";
                  } else {
                  return val
                };}else {self.$warn("asciidoctor: WARNING: illegal attribute directive: " + (m['$[]'](2)));
                return m['$[]'](0);}})();
              } else if (($a = ($c = (key = m['$[]'](2).$downcase()), $c !== false && $c !== nil ?(self.document.$attributes()['$has_key?'](key)) : $c)) !== false && $a !== nil) {
                return self.document.$attributes()['$[]'](key)
              } else if (($a = $opalScope.INTRINSICS['$has_key?'](key)) !== false && $a !== nil) {
                return $opalScope.INTRINSICS['$[]'](key)
                } else {
                return (function() {$case = (((($a = opts['$[]']("attribute_missing")) !== false && $a !== nil) ? $a : self.document.$attributes().$fetch("attribute-missing", $opalScope.Compliance.$attribute_missing())));if ("skip"['$===']($case)) {return m['$[]'](0)}else if ("drop-line"['$===']($case)) {($a = ($c = $opalScope.Debug).$debug, $a._p = (TMP_19 = function(){var self = TMP_19._s || this;
                return "Missing attribute: " + (key) + ", line marked for removal"}, TMP_19._s = self, TMP_19), $a).call($c);
                reject = true;
                return ($breaker.$v = "", $breaker);}else {reject_if_empty = true;
                return "";}})()
              };}, TMP_17._s = self, TMP_17), $a).call($b, $opalScope.REGEXP['$[]']("attr_ref"))};
          if (($a = ((($c = reject) !== false && $c !== nil) ? $c : ((($d = reject_if_empty !== false && reject_if_empty !== nil) ? line['$empty?']() : $d)))) !== false && $a !== nil) {
            return nil
            } else {
            return result['$<<'](line)
          };}, TMP_16._s = self, TMP_16), $a).call($b);
        if (string_data !== false && string_data !== nil) {
          return (result['$*']($opalScope.EOL))
          } else {
          return result
        };
      };

      def.$sub_macros = function(source) {
        var $a, $b, $c, TMP_20, TMP_22, $d, TMP_23, $e, $f, TMP_24, $g, TMP_26, TMP_27, $h, TMP_28, $i, $j, TMP_29, TMP_30, $k, TMP_31, self = this, found = nil, use_link_attrs = nil, experimental = nil, result = nil, extensions = nil;
        if (self.document == null) self.document = nil;

        if (($a = ((($b = source['$nil?']()) !== false && $b !== nil) ? $b : source['$empty?']())) !== false && $a !== nil) {
          return source};
        found = $hash2([], {});
        found['$[]=']("square_bracket", source['$include?']("["));
        found['$[]=']("round_bracket", source['$include?']("("));
        found['$[]=']("colon", source['$include?'](":"));
        found['$[]=']("macroish", (($a = found['$[]']("square_bracket"), $a !== false && $a !== nil ?found['$[]']("colon") : $a)));
        found['$[]=']("macroish_short_form", (($a = ($b = found['$[]']("square_bracket"), $b !== false && $b !== nil ?found['$[]']("colon") : $b), $a !== false && $a !== nil ?source['$include?'](":[") : $a)));
        use_link_attrs = self.document.$attributes()['$has_key?']("linkattrs");
        experimental = self.document.$attributes()['$has_key?']("experimental");
        result = source.$dup();
        if (experimental !== false && experimental !== nil) {
          if (($a = ($b = found['$[]']("macroish_short_form"), $b !== false && $b !== nil ?(((($c = result['$include?']("kbd:")) !== false && $c !== nil) ? $c : result['$include?']("btn:"))) : $b)) !== false && $a !== nil) {
            result = ($a = ($b = result).$gsub, $a._p = (TMP_20 = function(){var self = TMP_20._s || this, $a, $b, TMP_21, m = nil, captured = nil, keys = nil, label = nil;
            m = $gvars["~"];
              if (($a = ((captured = m['$[]'](0)))['$start_with?']("\\")) !== false && $a !== nil) {
                return captured['$[]']($range(1, -1, false));};
              if (($a = captured['$start_with?']("kbd")) !== false && $a !== nil) {
                keys = self.$unescape_bracketed_text(m['$[]'](1));
                if (keys['$==']("+")) {
                  keys = ["+"]
                  } else {
                  keys = ($a = ($b = keys.$split($opalScope.REGEXP['$[]']("kbd_delim"))).$opalInject, $a._p = (TMP_21 = function(c, key){var self = TMP_21._s || this, $a;if (c == null) c = nil;if (key == null) key = nil;
                  if (($a = key['$end_with?']("++")) !== false && $a !== nil) {
                      c['$<<'](key['$[]']($range(0, -3, false)).$strip());
                      c['$<<']("+");
                      } else {
                      c['$<<'](key.$strip())
                    };
                    return c;}, TMP_21._s = self, TMP_21), $a).call($b, [])
                };
                return $opalScope.Inline.$new(self, "kbd", nil, $hash2(["attributes"], {"attributes": $hash2(["keys"], {"keys": keys})})).$render();
              } else if (($a = captured['$start_with?']("btn")) !== false && $a !== nil) {
                label = self.$unescape_bracketed_text(m['$[]'](1));
                return $opalScope.Inline.$new(self, "button", label).$render();
                } else {
                return nil
              };}, TMP_20._s = self, TMP_20), $a).call($b, $opalScope.REGEXP['$[]']("kbd_btn_macro"))};
          if (($a = ($c = found['$[]']("macroish"), $c !== false && $c !== nil ?result['$include?']("menu:") : $c)) !== false && $a !== nil) {
            result = ($a = ($c = result).$gsub, $a._p = (TMP_22 = function(){var self = TMP_22._s || this, $a, $b, m = nil, captured = nil, menu = nil, items = nil, submenus = nil, menuitem = nil, delim = nil;
            m = $gvars["~"];
              if (($a = ((captured = m['$[]'](0)))['$start_with?']("\\")) !== false && $a !== nil) {
                return captured['$[]']($range(1, -1, false));};
              menu = m['$[]'](1);
              items = m['$[]'](2);
              if (($a = items['$nil?']()) !== false && $a !== nil) {
                submenus = [];
                menuitem = nil;
              } else if (($a = (delim = (function() {if (($b = items['$include?']("&gt;")) !== false && $b !== nil) {
                return "&gt;"
                } else {
                return ((function() {if (($b = items['$include?'](",")) !== false && $b !== nil) {
                  return ","
                  } else {
                  return nil
                }; return nil; })())
              }; return nil; })())) !== false && $a !== nil) {
                submenus = ($a = ($b = items.$split(delim)).$map, $a._p = "strip".$to_proc(), $a).call($b);
                menuitem = submenus.$pop();
                } else {
                submenus = [];
                menuitem = items.$rstrip();
              };
              return $opalScope.Inline.$new(self, "menu", nil, $hash2(["attributes"], {"attributes": $hash2(["menu", "submenus", "menuitem"], {"menu": menu, "submenus": submenus, "menuitem": menuitem})})).$render();}, TMP_22._s = self, TMP_22), $a).call($c, $opalScope.REGEXP['$[]']("menu_macro"))};
          if (($a = ($d = result['$include?']("\""), $d !== false && $d !== nil ?result['$include?']("&gt;") : $d)) !== false && $a !== nil) {
            result = ($a = ($d = result).$gsub, $a._p = (TMP_23 = function(){var self = TMP_23._s || this, $a, $b, $c, m = nil, captured = nil, input = nil, menu = nil, submenus = nil, menuitem = nil;
            m = $gvars["~"];
              if (($a = ((captured = m['$[]'](0)))['$start_with?']("\\")) !== false && $a !== nil) {
                return captured['$[]']($range(1, -1, false));};
              input = m['$[]'](1);
              $a = $opal.to_ary(($b = ($c = input.$split("&gt;")).$map, $b._p = "strip".$to_proc(), $b).call($c)), menu = ($a[0] == null ? nil : $a[0]), submenus = $slice.call($a, 1);
              menuitem = submenus.$pop();
              return $opalScope.Inline.$new(self, "menu", nil, $hash2(["attributes"], {"attributes": $hash2(["menu", "submenus", "menuitem"], {"menu": menu, "submenus": submenus, "menuitem": menuitem})})).$render();}, TMP_23._s = self, TMP_23), $a).call($d, $opalScope.REGEXP['$[]']("menu_inline_macro"))};};
        if (($a = ($e = ($f = (extensions = self.document.$extensions()), $f !== false && $f !== nil ?extensions['$inline_macros?']() : $f), $e !== false && $e !== nil ?found['$[]']("macroish") : $e)) !== false && $a !== nil) {
          ($a = ($e = extensions.$load_inline_macro_processors(self.document)).$each, $a._p = (TMP_24 = function(processor){var self = TMP_24._s || this, $a, $b, TMP_25;if (processor == null) processor = nil;
          return result = ($a = ($b = result).$gsub, $a._p = (TMP_25 = function(){var self = TMP_25._s || this, $a, m = nil, target = nil, attributes = nil, posattrs = nil;
            m = $gvars["~"];
              if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
                return m['$[]'](0)['$[]']($range(1, -1, false));};
              target = m['$[]'](1);
              if (($a = processor.$options()['$[]']("short_form")) !== false && $a !== nil) {
                attributes = $hash2([], {})
                } else {
                posattrs = processor.$options().$fetch("pos_attrs", []);
                attributes = self.$parse_attributes(m['$[]'](2), posattrs, $hash2(["sub_input", "unescape_input"], {"sub_input": true, "unescape_input": true}));
              };
              return processor.$process(self, target, attributes);}, TMP_25._s = self, TMP_25), $a).call($b, processor.$regexp())}, TMP_24._s = self, TMP_24), $a).call($e)};
        if (($a = ($f = found['$[]']("macroish"), $f !== false && $f !== nil ?(((($g = result['$include?']("image:")) !== false && $g !== nil) ? $g : result['$include?']("icon:"))) : $f)) !== false && $a !== nil) {
          result = ($a = ($f = result).$gsub, $a._p = (TMP_26 = function(){var self = TMP_26._s || this, $a, $b, m = nil, raw_attrs = nil, type = nil, posattrs = nil, target = nil, attrs = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            raw_attrs = self.$unescape_bracketed_text(m['$[]'](2));
            if (($a = m['$[]'](0)['$start_with?']("icon:")) !== false && $a !== nil) {
              type = "icon";
              posattrs = ["size"];
              } else {
              type = "image";
              posattrs = ["alt", "width", "height"];
            };
            target = self.$sub_attributes(m['$[]'](1));
            if (($a = type['$==']("icon")) === false || $a === nil) {
              self.document.$register("images", target)};
            attrs = self.$parse_attributes(raw_attrs, posattrs);
            if (($a = ($b = attrs['$[]']("alt"), ($b === nil || $b === false))) !== false && $a !== nil) {
              attrs['$[]=']("alt", $opalScope.File.$basename(target, $opalScope.File.$extname(target)))};
            return $opalScope.Inline.$new(self, "image", nil, $hash2(["type", "target", "attributes"], {"type": type, "target": target, "attributes": attrs})).$render();}, TMP_26._s = self, TMP_26), $a).call($f, $opalScope.REGEXP['$[]']("image_macro"))};
        if (($a = ((($g = found['$[]']("macroish_short_form")) !== false && $g !== nil) ? $g : found['$[]']("round_bracket"))) !== false && $a !== nil) {
          result = ($a = ($g = result).$gsub, $a._p = (TMP_27 = function(){var self = TMP_27._s || this, $a, $b, m = nil, num_brackets = nil, text_in_brackets = nil, macro_name = nil, terms = nil, text = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            num_brackets = 0;
            text_in_brackets = nil;
            if (($a = ((macro_name = m['$[]'](1)))['$nil?']()) !== false && $a !== nil) {
              text_in_brackets = m['$[]'](3);
              if (($a = ($b = (text_in_brackets['$start_with?']("(")), $b !== false && $b !== nil ?(text_in_brackets['$end_with?'](")")) : $b)) !== false && $a !== nil) {
                text_in_brackets = text_in_brackets['$[]']($range(1, -1, true));
                num_brackets = 3;
                } else {
                num_brackets = 2
              };};
            if (($a = ((($b = macro_name['$==']("indexterm")) !== false && $b !== nil) ? $b : num_brackets['$=='](3))) !== false && $a !== nil) {
              if (($a = macro_name['$nil?']()) !== false && $a !== nil) {
                terms = self.$split_simple_csv(self.$normalize_string(text_in_brackets))
                } else {
                terms = self.$split_simple_csv(self.$normalize_string(m['$[]'](2), true))
              };
              self.document.$register("indexterms", [].concat(terms));
              return $opalScope.Inline.$new(self, "indexterm", nil, $hash2(["attributes"], {"attributes": $hash2(["terms"], {"terms": terms})})).$render();
              } else {
              if (($a = macro_name['$nil?']()) !== false && $a !== nil) {
                text = self.$normalize_string(text_in_brackets)
                } else {
                text = self.$normalize_string(m['$[]'](2), true)
              };
              self.document.$register("indexterms", [text]);
              return $opalScope.Inline.$new(self, "indexterm", text, $hash2(["type"], {"type": "visible"})).$render();
            };}, TMP_27._s = self, TMP_27), $a).call($g, $opalScope.REGEXP['$[]']("indexterm_macro"))};
        if (($a = result['$include?']("://")) !== false && $a !== nil) {
          result = ($a = ($h = result).$gsub, $a._p = (TMP_28 = function(){var self = TMP_28._s || this, $a, $b, $c, m = nil, prefix = nil, target = nil, suffix = nil, attrs = nil, text = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](2)['$start_with?']("\\")) !== false && $a !== nil) {
              return "" + (m['$[]'](1)) + (m['$[]'](2)['$[]']($range(1, -1, false))) + (m['$[]'](3));
            } else if (($a = (($b = m['$[]'](1)['$==']("link:")) ? m['$[]'](3)['$nil?']() : $b)) !== false && $a !== nil) {
              return m['$[]'](0);};
            prefix = ((function() {if (($a = ($b = m['$[]'](1)['$==']("link:"), ($b === nil || $b === false))) !== false && $a !== nil) {
              return m['$[]'](1)
              } else {
              return ""
            }; return nil; })());
            target = m['$[]'](2);
            suffix = "";
            if (($a = ($b = prefix['$start_with?']("&lt;"), $b !== false && $b !== nil ?target['$end_with?']("&gt;") : $b)) !== false && $a !== nil) {
              prefix = prefix['$[]']($range(4, -1, false));
              target = target['$[]']($range(0, -5, false));
            } else if (($a = ($b = prefix['$start_with?']("("), $b !== false && $b !== nil ?target['$end_with?'](")") : $b)) !== false && $a !== nil) {
              target = target['$[]']($range(0, -2, false));
              suffix = ")";
            } else if (($a = target['$end_with?']("):")) !== false && $a !== nil) {
              target = target['$[]']($range(0, -3, false));
              suffix = "):";};
            self.document.$register("links", target);
            attrs = nil;
            if (($a = ($b = m['$[]'](3).$to_s()['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              if (($a = (($b = use_link_attrs !== false && use_link_attrs !== nil) ? (((($c = m['$[]'](3)['$start_with?']("\"")) !== false && $c !== nil) ? $c : m['$[]'](3)['$include?'](","))) : $b)) !== false && $a !== nil) {
                attrs = self.$parse_attributes(self.$sub_attributes(m['$[]'](3).$gsub("]", "]")), []);
                text = attrs['$[]'](1);
                } else {
                text = self.$sub_attributes(m['$[]'](3).$gsub("]", "]"))
              };
              if (($a = text['$end_with?']("^")) !== false && $a !== nil) {
                text = text.$chop();
                ((($a = attrs) !== false && $a !== nil) ? $a : attrs = $hash2([], {}));
                if (($a = attrs['$has_key?']("window")) === false || $a === nil) {
                  attrs['$[]=']("window", "_blank")};};
              } else {
              text = ""
            };
            if (($a = text['$empty?']()) !== false && $a !== nil) {
              if (($a = self.document['$attr?']("hide-uri-scheme")) !== false && $a !== nil) {
                text = target.$sub($opalScope.REGEXP['$[]']("uri_sniff"), "")
                } else {
                text = target
              }};
            return "" + (prefix) + ($opalScope.Inline.$new(self, "anchor", text, $hash2(["type", "target", "attributes"], {"type": "link", "target": target, "attributes": attrs})).$render()) + (suffix);}, TMP_28._s = self, TMP_28), $a).call($h, $opalScope.REGEXP['$[]']("link_inline"))};
        if (($a = ((($i = ($j = found['$[]']("macroish"), $j !== false && $j !== nil ?(result['$include?']("link:")) : $j)) !== false && $i !== nil) ? $i : (result['$include?']("mailto:")))) !== false && $a !== nil) {
          result = ($a = ($i = result).$gsub, $a._p = (TMP_29 = function(){var self = TMP_29._s || this, $a, $b, $c, m = nil, raw_target = nil, mailto = nil, target = nil, attrs = nil, text = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            raw_target = m['$[]'](1);
            mailto = m['$[]'](0)['$start_with?']("mailto:");
            target = (function() {if (mailto !== false && mailto !== nil) {
              return "mailto:" + (raw_target)
              } else {
              return raw_target
            }; return nil; })();
            attrs = nil;
            if (($a = (($b = use_link_attrs !== false && use_link_attrs !== nil) ? (((($c = m['$[]'](2)['$start_with?']("\"")) !== false && $c !== nil) ? $c : m['$[]'](2)['$include?'](","))) : $b)) !== false && $a !== nil) {
              attrs = self.$parse_attributes(self.$sub_attributes(m['$[]'](2).$gsub("]", "]")), []);
              text = attrs['$[]'](1);
              if (mailto !== false && mailto !== nil) {
                if (($a = attrs['$has_key?'](2)) !== false && $a !== nil) {
                  target = "" + (target) + "?subject=" + ($opalScope.Helpers.$encode_uri(attrs['$[]'](2)));
                  if (($a = attrs['$has_key?'](3)) !== false && $a !== nil) {
                    target = "" + (target) + "&amp;body=" + ($opalScope.Helpers.$encode_uri(attrs['$[]'](3)))};}};
              } else {
              text = self.$sub_attributes(m['$[]'](2).$gsub("]", "]"))
            };
            if (($a = text['$end_with?']("^")) !== false && $a !== nil) {
              text = text.$chop();
              ((($a = attrs) !== false && $a !== nil) ? $a : attrs = $hash2([], {}));
              if (($a = attrs['$has_key?']("window")) === false || $a === nil) {
                attrs['$[]=']("window", "_blank")};};
            self.document.$register("links", target);
            if (($a = text['$empty?']()) !== false && $a !== nil) {
              if (($a = self.document['$attr?']("hide-uri-scheme")) !== false && $a !== nil) {
                text = raw_target.$sub($opalScope.REGEXP['$[]']("uri_sniff"), "")
                } else {
                text = raw_target
              }};
            return $opalScope.Inline.$new(self, "anchor", text, $hash2(["type", "target", "attributes"], {"type": "link", "target": target, "attributes": attrs})).$render();}, TMP_29._s = self, TMP_29), $a).call($i, $opalScope.REGEXP['$[]']("link_macro"))};
        if (($a = result['$include?']("@")) !== false && $a !== nil) {
          result = ($a = ($j = result).$gsub, $a._p = (TMP_30 = function(){var self = TMP_30._s || this, m = nil, address = nil, $case = nil, target = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            address = m['$[]'](0);
            $case = address['$[]']($range(0, 0, false));if ("\\"['$===']($case)) {return address['$[]']($range(1, -1, false));}else if (">"['$===']($case) || ":"['$===']($case)) {return address;};
            target = "mailto:" + (address);
            self.document.$register("links", target);
            return $opalScope.Inline.$new(self, "anchor", address, $hash2(["type", "target"], {"type": "link", "target": target})).$render();}, TMP_30._s = self, TMP_30), $a).call($j, $opalScope.REGEXP['$[]']("email_inline"))};
        if (($a = ($k = found['$[]']("macroish_short_form"), $k !== false && $k !== nil ?result['$include?']("footnote") : $k)) !== false && $a !== nil) {
          result = ($a = ($k = result).$gsub, $a._p = (TMP_31 = function(){var self = TMP_31._s || this, $a, $b, TMP_32, m = nil, id = nil, text = nil, index = nil, type = nil, target = nil, footnote = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            if (m['$[]'](1)['$==']("footnote")) {
              id = nil;
              text = self.$restore_passthroughs(self.$sub_inline_xrefs(self.$sub_inline_anchors(self.$normalize_string(m['$[]'](2), true))));
              index = self.document.$counter("footnote-number");
              self.document.$register("footnotes", ($opalScope.Document)._scope.Footnote.$new(index, id, text));
              type = nil;
              target = nil;
              } else {
              $a = $opal.to_ary(m['$[]'](2).$split(",", 2)), id = ($a[0] == null ? nil : $a[0]), text = ($a[1] == null ? nil : $a[1]);
              id = id.$strip();
              if (($a = ($b = text['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                text = self.$restore_passthroughs(self.$sub_inline_xrefs(self.$sub_inline_anchors(self.$normalize_string(text, true))));
                index = self.document.$counter("footnote-number");
                self.document.$register("footnotes", ($opalScope.Document)._scope.Footnote.$new(index, id, text));
                type = "ref";
                target = nil;
                } else {
                footnote = ($a = ($b = self.document.$references()['$[]']("footnotes")).$find, $a._p = (TMP_32 = function(fn){var self = TMP_32._s || this;if (fn == null) fn = nil;
                return fn.$id()['$=='](id)}, TMP_32._s = self, TMP_32), $a).call($b);
                target = id;
                id = nil;
                index = footnote.$index();
                text = footnote.$text();
                type = "xref";
              };
            };
            return $opalScope.Inline.$new(self, "footnote", text, $hash2(["attributes", "id", "target", "type"], {"attributes": $hash2(["index"], {"index": index}), "id": id, "target": target, "type": type})).$render();}, TMP_31._s = self, TMP_31), $a).call($k, $opalScope.REGEXP['$[]']("footnote_macro"))};
        return self.$sub_inline_xrefs(self.$sub_inline_anchors(result, found), found);
      };

      def.$sub_inline_anchors = function(text, found) {
        var $a, $b, $c, TMP_33, $d, $e, TMP_34, self = this;
        if (found == null) {
          found = nil
        }
        if (($a = ($b = (((($c = found['$nil?']()) !== false && $c !== nil) ? $c : found['$[]']("square_bracket"))), $b !== false && $b !== nil ?text['$include?']("[[[") : $b)) !== false && $a !== nil) {
          text = ($a = ($b = text).$gsub, $a._p = (TMP_33 = function(){var self = TMP_33._s || this, $a, m = nil, id = nil, reftext = nil;
          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            id = reftext = m['$[]'](1);
            return $opalScope.Inline.$new(self, "anchor", reftext, $hash2(["type", "target"], {"type": "bibref", "target": id})).$render();}, TMP_33._s = self, TMP_33), $a).call($b, $opalScope.REGEXP['$[]']("biblio_macro"))};
        if (($a = ((($c = (($d = (((($e = found['$nil?']()) !== false && $e !== nil) ? $e : found['$[]']("square_bracket"))), $d !== false && $d !== nil ?text['$include?']("[[") : $d))) !== false && $c !== nil) ? $c : (($d = (((($e = found['$nil?']()) !== false && $e !== nil) ? $e : found['$[]']("macroish"))), $d !== false && $d !== nil ?text['$include?']("anchor:") : $d)))) !== false && $a !== nil) {
          text = ($a = ($c = text).$gsub, $a._p = (TMP_34 = function(){var self = TMP_34._s || this, $a, $b, TMP_35, m = nil, id = nil, reftext = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            id = ((($a = m['$[]'](1)) !== false && $a !== nil) ? $a : m['$[]'](3));
            reftext = ((($a = m['$[]'](2)) !== false && $a !== nil) ? $a : m['$[]'](4));
            if (($a = reftext['$nil?']()) !== false && $a !== nil) {
              reftext = "[" + (id) + "]"};
            if (($a = self.document.$references()['$[]']("ids")['$has_key?'](id)) === false || $a === nil) {
              ($a = ($b = $opalScope.Debug).$debug, $a._p = (TMP_35 = function(){var self = TMP_35._s || this;
              return "Missing reference for anchor " + (id)}, TMP_35._s = self, TMP_35), $a).call($b)};
            return $opalScope.Inline.$new(self, "anchor", reftext, $hash2(["type", "target"], {"type": "ref", "target": id})).$render();}, TMP_34._s = self, TMP_34), $a).call($c, $opalScope.REGEXP['$[]']("anchor_macro"))};
        return text;
      };

      def.$sub_inline_xrefs = function(text, found) {
        var $a, $b, $c, TMP_36, self = this;
        if (found == null) {
          found = nil
        }
        if (($a = ((($b = (((($c = found['$nil?']()) !== false && $c !== nil) ? $c : found['$[]']("macroish")))) !== false && $b !== nil) ? $b : text['$include?']("&lt;&lt;"))) !== false && $a !== nil) {
          text = ($a = ($b = text).$gsub, $a._p = (TMP_36 = function(){var self = TMP_36._s || this, $a, $b, $c, $d, m = nil, id = nil, reftext = nil, path = nil, fragment = nil, refid = nil, target = nil;
            if (self.document == null) self.document = nil;

          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return m['$[]'](0)['$[]']($range(1, -1, false));};
            if (($a = ((($b = m['$[]'](1)['$nil?']()) !== false && $b !== nil) ? $b : (($c = (($d = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $d), $c !== false && $c !== nil ?m['$[]'](1).$to_s()['$==']("") : $c)))) !== false && $a !== nil) {
              id = m['$[]'](2);
              reftext = (function() {if (($a = ($b = m['$[]'](3)['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                return m['$[]'](3)
                } else {
                return nil
              }; return nil; })();
              } else {
              $a = $opal.to_ary(($b = ($c = m['$[]'](1).$split(",", 2)).$map, $b._p = "strip".$to_proc(), $b).call($c)), id = ($a[0] == null ? nil : $a[0]), reftext = ($a[1] == null ? nil : $a[1]);
              id = id.$sub($opalScope.REGEXP['$[]']("dbl_quoted"), (function() {if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) !== false && $a !== nil) {
                return "$2"
                } else {
                return "2"
              }; return nil; })());
              if (($a = reftext['$nil?']()) === false || $a === nil) {
                reftext = reftext.$sub($opalScope.REGEXP['$[]']("m_dbl_quoted"), (function() {if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) !== false && $a !== nil) {
                  return "$2"
                  } else {
                  return "2"
                }; return nil; })())};
            };
            if (($a = id['$include?']("#")) !== false && $a !== nil) {
              $a = $opal.to_ary(id.$split("#")), path = ($a[0] == null ? nil : $a[0]), fragment = ($a[1] == null ? nil : $a[1])
              } else {
              path = nil;
              fragment = id;
            };
            if (($a = path['$nil?']()) !== false && $a !== nil) {
              refid = fragment;
              target = "#" + (fragment);
              } else {
              path = $opalScope.Helpers.$rootname(path);
              if (($a = ((($b = self.document.$attributes()['$[]']("docname")['$=='](path)) !== false && $b !== nil) ? $b : self.document.$references()['$[]']("includes")['$include?'](path))) !== false && $a !== nil) {
                refid = fragment;
                path = nil;
                target = "#" + (fragment);
                } else {
                refid = (function() {if (($a = fragment['$nil?']()) !== false && $a !== nil) {
                  return path
                  } else {
                  return "" + (path) + "#" + (fragment)
                }; return nil; })();
                path = "" + (path) + (self.document.$attributes().$fetch("outfilesuffix", ".html"));
                target = (function() {if (($a = fragment['$nil?']()) !== false && $a !== nil) {
                  return path
                  } else {
                  return "" + (path) + "#" + (fragment)
                }; return nil; })();
              };
            };
            return $opalScope.Inline.$new(self, "anchor", reftext, $hash2(["type", "target", "attributes"], {"type": "xref", "target": target, "attributes": $hash2(["path", "fragment", "refid"], {"path": path, "fragment": fragment, "refid": refid})})).$render();}, TMP_36._s = self, TMP_36), $a).call($b, $opalScope.REGEXP['$[]']("xref_macro"))};
        return text;
      };

      def.$sub_callouts = function(text) {
        var $a, $b, TMP_37, self = this;
        return ($a = ($b = text).$gsub, $a._p = (TMP_37 = function(){var self = TMP_37._s || this, m = nil;
          if (self.document == null) self.document = nil;

        m = $gvars["~"];
          if (m['$[]'](1)['$==']("\\")) {
            return m['$[]'](0).$sub("\\", "");};
          return $opalScope.Inline.$new(self, "callout", m['$[]'](3), $hash2(["id"], {"id": self.document.$callouts().$read_next_id()})).$render();}, TMP_37._s = self, TMP_37), $a).call($b, $opalScope.REGEXP['$[]']("callout_render"));
      };

      def.$sub_post_replacements = function(text) {
        var $a, $b, TMP_38, $c, TMP_39, self = this, lines = nil, last = nil;
        if (self.document == null) self.document = nil;
        if (self.attributes == null) self.attributes = nil;

        if (($a = ((($b = (self.document.$attributes()['$has_key?']("hardbreaks"))) !== false && $b !== nil) ? $b : (self.attributes['$has_key?']("hardbreaks-option")))) !== false && $a !== nil) {
          lines = (text.$split($opalScope.LINE_SPLIT));
          if (lines.$size()['$=='](1)) {
            return text};
          last = lines.$pop();
          return ($a = ($b = lines).$map, $a._p = (TMP_38 = function(line){var self = TMP_38._s || this;if (line == null) line = nil;
          return $opalScope.Inline.$new(self, "break", line.$rstrip().$chomp($opalScope.LINE_BREAK), $hash2(["type"], {"type": "line"})).$render()}, TMP_38._s = self, TMP_38), $a).call($b).$push(last)['$*']($opalScope.EOL);
          } else {
          return ($a = ($c = text).$gsub, $a._p = (TMP_39 = function(){var self = TMP_39._s || this;
          return $opalScope.Inline.$new(self, "break", $gvars["~"]['$[]'](1), $hash2(["type"], {"type": "line"})).$render()}, TMP_39._s = self, TMP_39), $a).call($c, $opalScope.REGEXP['$[]']("line_break"))
        };
      };

      def.$transform_quoted_text = function(match, type, scope) {
        var $a, $b, $c, self = this, unescaped_attrs = nil, attributes = nil, id = nil;
        unescaped_attrs = nil;
        if (($a = match['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
          if (($a = (($b = scope['$==']("constrained")) ? ($c = match['$[]'](2)['$nil?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
            unescaped_attrs = "[" + (match['$[]'](2)) + "]"
            } else {
            return match['$[]'](0)['$[]']($range(1, -1, false))
          }};
        if (scope['$==']("constrained")) {
          if (($a = unescaped_attrs['$nil?']()) !== false && $a !== nil) {
            attributes = self.$parse_quoted_text_attributes(match['$[]'](2));
            id = (function() {if (($a = attributes['$nil?']()) !== false && $a !== nil) {
              return nil
              } else {
              return attributes.$delete("id")
            }; return nil; })();
            return "" + (match['$[]'](1)) + ($opalScope.Inline.$new(self, "quoted", match['$[]'](3), $hash2(["type", "id", "attributes"], {"type": type, "id": id, "attributes": attributes})).$render());
            } else {
            return "" + (unescaped_attrs) + ($opalScope.Inline.$new(self, "quoted", match['$[]'](3), $hash2(["type", "attributes"], {"type": type, "attributes": $hash2([], {})})).$render())
          }
          } else {
          attributes = self.$parse_quoted_text_attributes(match['$[]'](1));
          id = (function() {if (($a = attributes['$nil?']()) !== false && $a !== nil) {
            return nil
            } else {
            return attributes.$delete("id")
          }; return nil; })();
          return $opalScope.Inline.$new(self, "quoted", match['$[]'](2), $hash2(["type", "id", "attributes"], {"type": type, "id": id, "attributes": attributes})).$render();
        };
      };

      def.$parse_quoted_text_attributes = function(str) {
        var $a, $b, self = this, _ = nil, segments = nil, id = nil, more_roles = nil, roles = nil, attrs = nil;
        if (($a = str['$nil?']()) !== false && $a !== nil) {
          return nil};
        if (($a = str['$empty?']()) !== false && $a !== nil) {
          return $hash2([], {})};
        if (($a = str['$include?']("{")) !== false && $a !== nil) {
          str = self.$sub_attributes(str)};
        str = str.$strip();
        if (($a = str['$include?'](",")) !== false && $a !== nil) {
          $a = $opal.to_ary(str.$split(",", 2)), str = ($a[0] == null ? nil : $a[0]), _ = ($a[1] == null ? nil : $a[1])};
        if (($a = str['$empty?']()) !== false && $a !== nil) {
          return $hash2([], {})
        } else if (($a = ((($b = str['$start_with?'](".")) !== false && $b !== nil) ? $b : str['$start_with?']("#"))) !== false && $a !== nil) {
          segments = str.$split("#", 2);
          if (segments.$length()['$>'](1)) {
            $a = $opal.to_ary(segments['$[]'](1).$split(".")), id = ($a[0] == null ? nil : $a[0]), more_roles = $slice.call($a, 1)
            } else {
            id = nil;
            more_roles = [];
          };
          roles = (function() {if (($a = segments['$[]'](0)['$empty?']()) !== false && $a !== nil) {
            return []
            } else {
            return segments['$[]'](0).$split(".")
          }; return nil; })();
          if (roles.$length()['$>'](1)) {
            roles.$shift()};
          if (more_roles.$length()['$>'](0)) {
            roles.$concat(more_roles)};
          attrs = $hash2([], {});
          if (($a = id['$nil?']()) === false || $a === nil) {
            attrs['$[]=']("id", id)};
          if (($a = roles['$empty?']()) === false || $a === nil) {
            attrs['$[]=']("role", roles['$*'](" "))};
          return attrs;
          } else {
          return $hash2(["role"], {"role": str})
        };
      };

      def.$parse_attributes = function(attrline, posattrs, opts) {
        var $a, self = this, block = nil;
        if (self.document == null) self.document = nil;

        if (posattrs == null) {
          posattrs = ["role"]
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = attrline['$nil?']()) !== false && $a !== nil) {
          return nil};
        if (($a = attrline['$empty?']()) !== false && $a !== nil) {
          return $hash2([], {})};
        if (($a = opts['$[]']("sub_input")) !== false && $a !== nil) {
          attrline = self.document.$sub_attributes(attrline)};
        if (($a = opts['$[]']("unescape_input")) !== false && $a !== nil) {
          attrline = self.$unescape_bracketed_text(attrline)};
        block = nil;
        if (($a = opts.$fetch("sub_result", true)) !== false && $a !== nil) {
          block = self};
        if (($a = opts['$has_key?']("into")) !== false && $a !== nil) {
          return $opalScope.AttributeList.$new(attrline, block).$parse_into(opts['$[]']("into"), posattrs)
          } else {
          return $opalScope.AttributeList.$new(attrline, block).$parse(posattrs)
        };
      };

      def.$unescape_bracketed_text = function(text) {
        var $a, self = this;
        if (($a = text['$empty?']()) !== false && $a !== nil) {
          return ""};
        return text.$strip().$tr($opalScope.EOL, " ").$gsub("]", "]");
      };

      def.$normalize_string = function(str, unescape_brackets) {
        var $a, self = this;
        if (unescape_brackets == null) {
          unescape_brackets = false
        }
        if (($a = str['$empty?']()) !== false && $a !== nil) {
          return ""
        } else if (unescape_brackets !== false && unescape_brackets !== nil) {
          return self.$unescape_brackets(str.$strip().$tr($opalScope.EOL, " "))
          } else {
          return str.$strip().$tr($opalScope.EOL, " ")
        };
      };

      def.$unescape_brackets = function(str) {
        var $a, self = this;
        if (($a = str['$empty?']()) !== false && $a !== nil) {
          return ""
          } else {
          return str.$gsub("]", "]")
        };
      };

      def.$split_simple_csv = function(str) {
        var $a, $b, TMP_40, $c, self = this, values = nil, current = nil, quote_open = nil;
        if (($a = str['$empty?']()) !== false && $a !== nil) {
          values = []
        } else if (($a = str['$include?']("\"")) !== false && $a !== nil) {
          values = [];
          current = [];
          quote_open = false;
          ($a = ($b = str).$each_char, $a._p = (TMP_40 = function(c){var self = TMP_40._s || this, $a, $case = nil;if (c == null) c = nil;
          return (function() {$case = c;if (","['$===']($case)) {if (quote_open !== false && quote_open !== nil) {
              return current.$push(c)
              } else {
              values['$<<'](current.$join().$strip());
              return current = [];
            }}else if ("\""['$===']($case)) {return quote_open = ($a = quote_open, ($a === nil || $a === false))}else {return current.$push(c)}})()}, TMP_40._s = self, TMP_40), $a).call($b);
          values['$<<'](current.$join().$strip());
          } else {
          values = ($a = ($c = str.$split(",")).$map, $a._p = "strip".$to_proc(), $a).call($c)
        };
        return values;
      };

      def.$resolve_subs = function(subs, type, defaults, subject) {
        var $a, $b, TMP_41, self = this, candidates = nil, modification_group = nil, resolved = nil, invalid = nil;
        if (type == null) {
          type = "block"
        }
        if (defaults == null) {
          defaults = nil
        }
        if (subject == null) {
          subject = nil
        }
        if (($a = ((($b = subs['$nil?']()) !== false && $b !== nil) ? $b : subs['$empty?']())) !== false && $a !== nil) {
          return []};
        candidates = [];
        modification_group = (function() {if (($a = defaults['$nil?']()) !== false && $a !== nil) {
          return false
          } else {
          return nil
        }; return nil; })();
        ($a = ($b = subs.$split(",")).$each, $a._p = (TMP_41 = function(val){var self = TMP_41._s || this, $a, $b, $c, key = nil, first = nil, operation = nil, resolved_keys = nil, resolved_key = nil, $case = nil;if (val == null) val = nil;
        key = val.$strip();
          if (($a = ($b = modification_group['$=='](false), ($b === nil || $b === false))) !== false && $a !== nil) {
            if (((first = key['$[]']($range(0, 0, false))))['$==']("+")) {
              operation = "append";
              key = key['$[]']($range(1, -1, false));
            } else if (first['$==']("-")) {
              operation = "remove";
              key = key['$[]']($range(1, -1, false));
            } else if (($a = key['$end_with?']("+")) !== false && $a !== nil) {
              operation = "prepend";
              key = key['$[]']($range(0, -1, true));
            } else if (modification_group !== false && modification_group !== nil) {
              self.$warn("asciidoctor: WARNING: invalid entry in substitution modification group" + ((function() {if (subject !== false && subject !== nil) {
                return " for "
                } else {
                return nil
              }; return nil; })()) + (subject) + ": " + (key));
              return nil;;
              } else {
              operation = nil
            };
            if (($a = modification_group['$nil?']()) !== false && $a !== nil) {
              if (operation !== false && operation !== nil) {
                candidates = defaults.$dup();
                modification_group = true;
                } else {
                modification_group = false
              }};};
          key = key.$to_sym();
          if (($a = (($b = type['$==']("inline")) ? (((($c = key['$==']("verbatim")) !== false && $c !== nil) ? $c : key['$==']("v"))) : $b)) !== false && $a !== nil) {
            resolved_keys = ["specialcharacters"]
          } else if (($a = $opalScope.COMPOSITE_SUBS['$has_key?'](key)) !== false && $a !== nil) {
            resolved_keys = $opalScope.COMPOSITE_SUBS['$[]'](key)
          } else if (($a = ($b = (($c = type['$==']("inline")) ? key.$to_s().$length()['$=='](1) : $c), $b !== false && $b !== nil ?($opalScope.SUB_SYMBOLS['$has_key?'](key)) : $b)) !== false && $a !== nil) {
            resolved_key = $opalScope.SUB_SYMBOLS['$[]'](key);
            if (($a = $opalScope.COMPOSITE_SUBS['$has_key?'](resolved_key)) !== false && $a !== nil) {
              resolved_keys = $opalScope.COMPOSITE_SUBS['$[]'](resolved_key)
              } else {
              resolved_keys = [resolved_key]
            };
            } else {
            resolved_keys = [key]
          };
          if (modification_group !== false && modification_group !== nil) {
            return (function() {$case = operation;if ("append"['$===']($case)) {return candidates = candidates['$+'](resolved_keys)}else if ("prepend"['$===']($case)) {return candidates = resolved_keys['$+'](candidates)}else if ("remove"['$===']($case)) {return candidates = candidates['$-'](resolved_keys)}else { return nil }})()
            } else {
            return candidates = candidates['$+'](resolved_keys)
          };}, TMP_41._s = self, TMP_41), $a).call($b);
        resolved = candidates['$&']($opalScope.SUB_OPTIONS['$[]'](type));
        if (((invalid = candidates['$-'](resolved))).$size()['$>'](0)) {
          self.$warn("asciidoctor: WARNING: invalid substitution type" + ((function() {if (invalid.$size()['$>'](1)) {
            return "s"
            } else {
            return ""
          }; return nil; })()) + ((function() {if (subject !== false && subject !== nil) {
            return " for "
            } else {
            return nil
          }; return nil; })()) + (subject) + ": " + (invalid['$*'](", ")))};
        return resolved;
      };

      def.$resolve_block_subs = function(subs, defaults, subject) {
        var self = this;
        return self.$resolve_subs(subs, "block", defaults, subject);
      };

      def.$resolve_pass_subs = function(subs) {
        var self = this;
        return self.$resolve_subs(subs, "inline", nil, "passthrough macro");
      };

      def.$highlight_source = function(source, sub_callouts, highlighter) {
        var $a, $b, TMP_42, $c, $d, TMP_44, self = this, callout_marks = nil, lineno = nil, callout_on_last = nil, last = nil, linenums_mode = nil, $case = nil, result = nil, lexer = nil, opts = nil, reached_code = nil;
        if (self.document == null) self.document = nil;
        if (self.passthroughs == null) self.passthroughs = nil;

        if (highlighter == null) {
          highlighter = nil
        }
        ((($a = highlighter) !== false && $a !== nil) ? $a : highlighter = self.document.$attributes()['$[]']("source-highlighter"));
        $opalScope.Helpers.$require_library(highlighter, ((function() {if (highlighter['$==']("pygments")) {
          return "pygments.rb"
          } else {
          return highlighter
        }; return nil; })()));
        callout_marks = $hash2([], {});
        lineno = 0;
        callout_on_last = false;
        if (sub_callouts !== false && sub_callouts !== nil) {
          last = -1;
          source = ($a = ($b = source.$split($opalScope.LINE_SPLIT)).$map, $a._p = (TMP_42 = function(line){var self = TMP_42._s || this, $a, $b, TMP_43;if (line == null) line = nil;
          lineno = lineno['$+'](1);
            return ($a = ($b = line).$gsub, $a._p = (TMP_43 = function(){var self = TMP_43._s || this, $a, $b, $c, m = nil;
            m = $gvars["~"];
              if (m['$[]'](1)['$==']("\\")) {
                return m['$[]'](0).$sub("\\", "")
                } else {
                (($a = lineno, $b = callout_marks, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))))['$<<'](m['$[]'](3));
                last = lineno;
                return nil;
              };}, TMP_43._s = self, TMP_43), $a).call($b, $opalScope.REGEXP['$[]']("callout_scan"));}, TMP_42._s = self, TMP_42), $a).call($b)['$*']($opalScope.EOL);
          callout_on_last = (last['$=='](lineno));};
        linenums_mode = nil;
        $case = highlighter;if ("coderay"['$===']($case)) {result = ((($a = $opal.Object._scope.CodeRay) == null ? $opal.cm('CodeRay') : $a))._scope.Duo['$[]'](self.$attr("language", "text").$to_sym(), "html", $hash2(["css", "line_numbers", "line_number_anchors"], {"css": self.document.$attributes().$fetch("coderay-css", "class").$to_sym(), "line_numbers": (linenums_mode = ((function() {if (($a = self['$attr?']("linenums")) !== false && $a !== nil) {
          return self.document.$attributes().$fetch("coderay-linenums-mode", "table").$to_sym()
          } else {
          return nil
        }; return nil; })())), "line_number_anchors": false})).$highlight(source)}else if ("pygments"['$===']($case)) {lexer = ((($a = $opal.Object._scope.Pygments) == null ? $opal.cm('Pygments') : $a))._scope.Lexer['$[]'](self.$attr("language"));
        if (lexer !== false && lexer !== nil) {
          opts = $hash2(["cssclass", "classprefix", "nobackground"], {"cssclass": "pyhl", "classprefix": "tok-", "nobackground": true});
          if (($a = self.document.$attributes().$fetch("pygments-css", "class")['$==']("class")) === false || $a === nil) {
            opts['$[]=']("noclasses", true)};
          if (($a = self['$attr?']("linenums")) !== false && $a !== nil) {
            opts['$[]=']("linenos", ((linenums_mode = self.document.$attributes().$fetch("pygments-linenums-mode", "table").$to_sym())).$to_s())};
          if (linenums_mode['$==']("table")) {
            result = lexer.$highlight(source, $hash2(["options"], {"options": opts})).$sub(/<div class="pyhl">(.*)<\/div>/i, "1").$gsub(/<pre[^>]*>(.*?)<\/pre>\s*/i, "1")
            } else {
            result = lexer.$highlight(source, $hash2(["options"], {"options": opts})).$sub(/<div class="pyhl"><pre[^>]*>(.*?)<\/pre><\/div>/i, "1")
          };
          } else {
          result = source
        };};
        if (($a = self.passthroughs['$empty?']()) === false || $a === nil) {
          result = result.$gsub($opalScope.PASS_PLACEHOLDER['$[]']("match_syn"), "" + ($opalScope.PASS_PLACEHOLDER['$[]']("start")) + "\\1" + ($opalScope.PASS_PLACEHOLDER['$[]']("end")))};
        if (($a = ((($c = ($d = sub_callouts, ($d === nil || $d === false))) !== false && $c !== nil) ? $c : callout_marks['$empty?']())) !== false && $a !== nil) {
          return result
          } else {
          lineno = 0;
          reached_code = ($a = linenums_mode['$==']("table"), ($a === nil || $a === false));
          return ($a = ($c = result.$split($opalScope.LINE_SPLIT)).$map, $a._p = (TMP_44 = function(line){var self = TMP_44._s || this, $a, $b, $c, TMP_45, conums = nil, tail = nil, pos = nil, conums_markup = nil;
            if (self.document == null) self.document = nil;
if (line == null) line = nil;
          if (($a = reached_code) === false || $a === nil) {
              if (($a = line['$include?']("<td class=\"code\">")) === false || $a === nil) {
                return line;};
              reached_code = true;};
            lineno = lineno['$+'](1);
            if (($a = (conums = callout_marks.$delete(lineno))) !== false && $a !== nil) {
              tail = nil;
              if (($a = ($b = (($c = callout_on_last !== false && callout_on_last !== nil) ? callout_marks['$empty?']() : $c), $b !== false && $b !== nil ?(pos = line.$index("</pre>")) : $b)) !== false && $a !== nil) {
                tail = line['$[]']($range(pos, -1, false));
                line = line['$[]']($range(0, pos, true));};
              if (conums.$size()['$=='](1)) {
                return "" + (line) + ($opalScope.Inline.$new(self, "callout", conums.$first(), $hash2(["id"], {"id": self.document.$callouts().$read_next_id()})).$render()) + (tail)
                } else {
                conums_markup = ($a = ($b = conums).$map, $a._p = (TMP_45 = function(conum){var self = TMP_45._s || this;
                  if (self.document == null) self.document = nil;
if (conum == null) conum = nil;
                return $opalScope.Inline.$new(self, "callout", conum, $hash2(["id"], {"id": self.document.$callouts().$read_next_id()})).$render()}, TMP_45._s = self, TMP_45), $a).call($b)['$*'](" ");
                return "" + (line) + (conums_markup) + (tail);
              };
              } else {
              return line
            };}, TMP_44._s = self, TMP_44), $a).call($c)['$*']($opalScope.EOL);
        };
      };

      def.$lock_in_subs = function() {
        var $a, $b, $c, $d, $e, TMP_46, self = this, default_subs = nil, $case = nil, custom_subs = nil, highlighter = nil;
        if (self.content_model == null) self.content_model = nil;
        if (self.context == null) self.context = nil;
        if (self.attributes == null) self.attributes = nil;
        if (self.style == null) self.style = nil;
        if (self.document == null) self.document = nil;
        if (self.subs == null) self.subs = nil;

        default_subs = [];
        $case = self.content_model;if ("simple"['$===']($case)) {default_subs = $opalScope.SUBS['$[]']("normal")}else if ("verbatim"['$===']($case)) {if (($a = ((($b = self.context['$==']("listing")) !== false && $b !== nil) ? $b : ((($c = self.context['$==']("literal")) ? ($d = (self['$option?']("listparagraph")), ($d === nil || $d === false)) : $c)))) !== false && $a !== nil) {
          default_subs = $opalScope.SUBS['$[]']("verbatim")
        } else if (self.context['$==']("verse")) {
          default_subs = $opalScope.SUBS['$[]']("normal")
          } else {
          default_subs = $opalScope.SUBS['$[]']("basic")
        }}else if ("raw"['$===']($case)) {default_subs = $opalScope.SUBS['$[]']("pass")}else {return nil};
        if (($a = (custom_subs = self.attributes['$[]']("subs"))) !== false && $a !== nil) {
          self.subs = self.$resolve_block_subs(custom_subs, default_subs, self.context)
          } else {
          self.subs = default_subs.$dup()
        };
        if (($a = ($b = ($c = ($d = (($e = self.context['$==']("listing")) ? self.style['$==']("source") : $e), $d !== false && $d !== nil ?(self.document['$basebackend?']("html")) : $d), $c !== false && $c !== nil ?(((($d = ((highlighter = self.document.$attributes()['$[]']("source-highlighter")))['$==']("coderay")) !== false && $d !== nil) ? $d : highlighter['$==']("pygments"))) : $c), $b !== false && $b !== nil ?(self['$attr?']("language")) : $b)) !== false && $a !== nil) {
          return self.subs = ($a = ($b = self.subs).$map, $a._p = (TMP_46 = function(sub){var self = TMP_46._s || this;if (sub == null) sub = nil;
          if (sub['$==']("specialcharacters")) {
              return "highlight"
              } else {
              return sub
            }}, TMP_46._s = self, TMP_46), $a).call($b)
          } else {
          return nil
        };
      };
            ;$opal.donate(self, ["$apply_subs", "$apply_normal_subs", "$apply_title_subs", "$apply_header_subs", "$extract_passthroughs", "$restore_passthroughs", "$sub_specialcharacters", "$sub_specialchars", "$sub_quotes", "$sub_replacements", "$do_replacement", "$sub_attributes", "$sub_macros", "$sub_inline_anchors", "$sub_inline_xrefs", "$sub_callouts", "$sub_post_replacements", "$transform_quoted_text", "$parse_quoted_text_attributes", "$parse_attributes", "$unescape_bracketed_text", "$normalize_string", "$unescape_brackets", "$split_simple_csv", "$resolve_subs", "$resolve_block_subs", "$resolve_pass_subs", "$highlight_source", "$lock_in_subs"]);
    })(self)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $AbstractNode(){};
      var self = $AbstractNode = $klass($base, $super, 'AbstractNode', $AbstractNode);

      var def = $AbstractNode._proto, $opalScope = $AbstractNode._scope;
      def.document = def.attributes = def.style = nil;
      self.$include($opalScope.Substitutors);

      self.$attr_reader("parent");

      self.$attr_reader("document");

      self.$attr_reader("context");

      self.$attr_accessor("id");

      self.$attr_reader("attributes");

      def.$initialize = function(parent, context) {
        var $a, self = this;
        if (context['$==']("document")) {
          self.parent = nil;
          self.document = parent;
          } else {
          self.parent = parent;
          self.document = ((function() {if (($a = parent['$nil?']()) !== false && $a !== nil) {
            return nil
            } else {
            return parent.$document()
          }; return nil; })());
        };
        self.context = context;
        self.attributes = $hash2([], {});
        return self.passthroughs = [];
      };

      def['$parent='] = function(parent) {
        var self = this;
        self.parent = parent;
        self.document = parent.$document();
        return nil;
      };

      def.$attr = function(name, default_value, inherit) {
        var $a, $b, self = this;
        if (default_value == null) {
          default_value = nil
        }
        if (inherit == null) {
          inherit = true
        }
        if (($a = name['$is_a?']($opalScope.Symbol)) !== false && $a !== nil) {
          name = name.$to_s()};
        if (self['$=='](self.document)) {
          inherit = false};
        if (inherit !== false && inherit !== nil) {
          return ((($a = ((($b = self.attributes['$[]'](name)) !== false && $b !== nil) ? $b : self.document.$attributes()['$[]'](name))) !== false && $a !== nil) ? $a : default_value)
          } else {
          return ((($a = self.attributes['$[]'](name)) !== false && $a !== nil) ? $a : default_value)
        };
      };

      def['$attr?'] = function(name, expect, inherit) {
        var $a, $b, self = this;
        if (expect == null) {
          expect = nil
        }
        if (inherit == null) {
          inherit = true
        }
        if (($a = name['$is_a?']($opalScope.Symbol)) !== false && $a !== nil) {
          name = name.$to_s()};
        if (self['$=='](self.document)) {
          inherit = false};
        if (($a = expect['$nil?']()) !== false && $a !== nil) {
          return ((($a = self.attributes['$has_key?'](name)) !== false && $a !== nil) ? $a : ((($b = inherit !== false && inherit !== nil) ? self.document.$attributes()['$has_key?'](name) : $b)))
        } else if (inherit !== false && inherit !== nil) {
          return expect['$==']((((($a = self.attributes['$[]'](name)) !== false && $a !== nil) ? $a : self.document.$attributes()['$[]'](name))))
          } else {
          return expect['$=='](self.attributes['$[]'](name))
        };
      };

      def.$set_attr = function(key, val, overwrite) {
        var $a, $b, self = this;
        if (overwrite == null) {
          overwrite = nil
        }
        if (($a = overwrite['$nil?']()) !== false && $a !== nil) {
          self.attributes['$[]='](key, val);
          return true;
        } else if (($a = ((($b = overwrite) !== false && $b !== nil) ? $b : self.attributes['$has_key?'](key))) !== false && $a !== nil) {
          self.attributes['$[]='](key, val);
          return true;
          } else {
          return false
        };
      };

      def.$set_option = function(name) {
        var $a, self = this;
        if (($a = self.attributes['$has_key?']("options")) !== false && $a !== nil) {
          self.attributes['$[]=']("options", "" + (self.attributes['$[]']("options")) + "," + (name))
          } else {
          self.attributes['$[]=']("options", name)
        };
        return self.attributes['$[]=']("" + (name) + "-option", "");
      };

      def['$option?'] = function(name) {
        var self = this;
        return self.attributes['$has_key?']("" + (name) + "-option");
      };

      def.$get_binding = function(template) {
        var self = this;
        return self.$binding();
      };

      def.$update_attributes = function(attributes) {
        var self = this;
        self.attributes.$update(attributes);
        return nil;
      };

      def.$renderer = function() {
        var self = this;
        return self.document.$renderer();
      };

      def['$role?'] = function(expect) {
        var $a, self = this;
        if (expect == null) {
          expect = nil
        }
        if (($a = expect['$nil?']()) !== false && $a !== nil) {
          return ((($a = self.attributes['$has_key?']("role")) !== false && $a !== nil) ? $a : self.document.$attributes()['$has_key?']("role"))
          } else {
          return expect['$==']((((($a = self.attributes['$[]']("role")) !== false && $a !== nil) ? $a : self.document.$attributes()['$[]']("role"))))
        };
      };

      def.$role = function() {
        var $a, self = this;
        return ((($a = self.attributes['$[]']("role")) !== false && $a !== nil) ? $a : self.document.$attributes()['$[]']("role"));
      };

      def['$has_role?'] = function(name) {
        var $a, $b, self = this, val = nil;
        if (($a = (val = (((($b = self.attributes['$[]']("role")) !== false && $b !== nil) ? $b : self.document.$attributes()['$[]']("role"))))) !== false && $a !== nil) {
          return val.$split(" ")['$include?'](name)
          } else {
          return false
        };
      };

      def.$roles = function() {
        var $a, $b, self = this, val = nil;
        if (($a = (val = (((($b = self.attributes['$[]']("role")) !== false && $b !== nil) ? $b : self.document.$attributes()['$[]']("role"))))) !== false && $a !== nil) {
          return val.$split(" ")
          } else {
          return []
        };
      };

      def['$reftext?'] = function() {
        var $a, self = this;
        return ((($a = self.attributes['$has_key?']("reftext")) !== false && $a !== nil) ? $a : self.document.$attributes()['$has_key?']("reftext"));
      };

      def.$reftext = function() {
        var $a, self = this;
        return ((($a = self.attributes['$[]']("reftext")) !== false && $a !== nil) ? $a : self.document.$attributes()['$[]']("reftext"));
      };

      def.$short_tag_slash = function() {
        var self = this;
        if (self.document.$attributes()['$[]']("htmlsyntax")['$==']("xml")) {
          return "/"
          } else {
          return nil
        };
      };

      def.$icon_uri = function(name) {
        var $a, self = this;
        if (($a = self['$attr?']("icon")) !== false && $a !== nil) {
          return self.$image_uri(self.$attr("icon"), nil)
          } else {
          return self.$image_uri("" + (name) + "." + (self.document.$attr("icontype", "png")), "iconsdir")
        };
      };

      def.$media_uri = function(target, asset_dir_key) {
        var $a, $b, self = this;
        if (asset_dir_key == null) {
          asset_dir_key = "imagesdir"
        }
        if (($a = ($b = target['$include?'](":"), $b !== false && $b !== nil ?target.$match(($opalScope.Asciidoctor)._scope.REGEXP['$[]']("uri_sniff")) : $b)) !== false && $a !== nil) {
          return target
        } else if (($a = (($b = asset_dir_key !== false && asset_dir_key !== nil) ? self['$attr?'](asset_dir_key) : $b)) !== false && $a !== nil) {
          return self.$normalize_web_path(target, self.document.$attr(asset_dir_key))
          } else {
          return self.$normalize_web_path(target)
        };
      };

      def.$image_uri = function(target_image, asset_dir_key) {
        var $a, $b, self = this;
        if (asset_dir_key == null) {
          asset_dir_key = "imagesdir"
        }
        if (($a = ($b = target_image['$include?'](":"), $b !== false && $b !== nil ?target_image.$match(($opalScope.Asciidoctor)._scope.REGEXP['$[]']("uri_sniff")) : $b)) !== false && $a !== nil) {
          return target_image
        } else if (($a = (($b = self.document.$safe()['$<']((($opalScope.Asciidoctor)._scope.SafeMode)._scope.SECURE)) ? self.document['$attr?']("data-uri") : $b)) !== false && $a !== nil) {
          return self.$generate_data_uri(target_image, asset_dir_key)
        } else if (($a = (($b = asset_dir_key !== false && asset_dir_key !== nil) ? self['$attr?'](asset_dir_key) : $b)) !== false && $a !== nil) {
          return self.$normalize_web_path(target_image, self.document.$attr(asset_dir_key))
          } else {
          return self.$normalize_web_path(target_image)
        };
      };

      def.$generate_data_uri = function(target_image, asset_dir_key) {
        var $a, $b, TMP_1, self = this, ext = nil, mimetype = nil, image_path = nil, bindata = nil;
        if (asset_dir_key == null) {
          asset_dir_key = nil
        }
        ext = $opalScope.File.$extname(target_image)['$[]']($range(1, -1, false));
        mimetype = "image/"['$+'](ext);
        if (ext['$==']("svg")) {
          mimetype = "" + (mimetype) + "+xml"};
        if (asset_dir_key !== false && asset_dir_key !== nil) {
          image_path = self.$normalize_system_path(target_image, self.document.$attr(asset_dir_key), nil, $hash2(["target_name"], {"target_name": "image"}))
          } else {
          image_path = self.$normalize_system_path(target_image)
        };
        if (($a = ($b = $opalScope.File['$readable?'](image_path), ($b === nil || $b === false))) !== false && $a !== nil) {
          self.$warn("asciidoctor: WARNING: image to embed not found or not readable: " + (image_path));
          return "data:" + (mimetype) + ":base64,";};
        bindata = nil;
        if (($a = $opalScope.IO['$respond_to?']("binread")) !== false && $a !== nil) {
          bindata = $opalScope.IO.$binread(image_path)
          } else {
          bindata = ($a = ($b = $opalScope.File).$open, $a._p = (TMP_1 = function(file){var self = TMP_1._s || this;if (file == null) file = nil;
          return file.$read()}, TMP_1._s = self, TMP_1), $a).call($b, image_path, "rb")
        };
        return "data:" + (mimetype) + ";base64," + ($opalScope.Base64.$encode64(bindata).$delete("\n"));
      };

      def.$read_asset = function(path, warn_on_failure) {
        var $a, self = this;
        if (warn_on_failure == null) {
          warn_on_failure = false
        }
        if (($a = $opalScope.File['$readable?'](path)) !== false && $a !== nil) {
          return $opalScope.File.$read(path).$chomp()
          } else {
          if (warn_on_failure !== false && warn_on_failure !== nil) {
            self.$warn("asciidoctor: WARNING: file does not exist or cannot be read: " + (path))};
          return nil;
        };
      };

      def.$normalize_web_path = function(target, start) {
        var self = this;
        if (start == null) {
          start = nil
        }
        return $opalScope.PathResolver.$new().$web_path(target, start);
      };

      def.$normalize_system_path = function(target, start, jail, opts) {
        var $a, $b, self = this;
        if (start == null) {
          start = nil
        }
        if (jail == null) {
          jail = nil
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = start['$nil?']()) !== false && $a !== nil) {
          start = self.document.$base_dir()};
        if (($a = ($b = jail['$nil?'](), $b !== false && $b !== nil ?self.document.$safe()['$>='](($opalScope.SafeMode)._scope.SAFE) : $b)) !== false && $a !== nil) {
          jail = self.document.$base_dir()};
        return $opalScope.PathResolver.$new().$system_path(target, start, jail, opts);
      };

      def.$normalize_asset_path = function(asset_ref, asset_name, autocorrect) {
        var self = this;
        if (asset_name == null) {
          asset_name = "path"
        }
        if (autocorrect == null) {
          autocorrect = true
        }
        return self.$normalize_system_path(asset_ref, self.document.$base_dir(), nil, $hash2(["target_name", "recover"], {"target_name": asset_name, "recover": autocorrect}));
      };

      def.$relative_path = function(filename) {
        var self = this;
        return $opalScope.PathResolver.$new().$relative_path(filename, self.document.$base_dir());
      };

      return (def.$list_marker_keyword = function(list_type) {
        var $a, self = this;
        if (list_type == null) {
          list_type = nil
        }
        return $opalScope.ORDERED_LIST_KEYWORDS['$[]'](((($a = list_type) !== false && $a !== nil) ? $a : self.style));
      }, nil);
    })(self, null)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $AbstractBlock(){};
      var self = $AbstractBlock = $klass($base, $super, 'AbstractBlock', $AbstractBlock);

      var def = $AbstractBlock._proto, $opalScope = $AbstractBlock._scope, TMP_1;
      def.context = def.document = def.attributes = def.template_name = def.blocks = def.subs = def.title = def.subbed_title = def.caption = def.next_section_index = def.next_section_number = nil;
      self.$attr_accessor("content_model");

      self.$attr_reader("subs");

      self.$attr_accessor("template_name");

      self.$attr_reader("blocks");

      self.$attr_accessor("level");

      self.$attr_writer("title");

      self.$attr_accessor("style");

      self.$attr_accessor("caption");

      def.$initialize = TMP_1 = function(parent, context) {
        var $a, $b, $c, self = this, $iter = TMP_1._p, $yield = $iter || nil;
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, context]);
        self.content_model = "compound";
        self.subs = [];
        self.template_name = "block_" + (context);
        self.blocks = [];
        self.id = nil;
        self.title = nil;
        self.caption = nil;
        self.style = nil;
        if (context['$==']("document")) {
          self.level = 0
        } else if (($a = ($b = ($c = parent['$nil?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = self.context['$==']("section"), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          self.level = parent.$level()
          } else {
          self.level = nil
        };
        self.next_section_index = 0;
        return self.next_section_number = 1;
      };

      def['$context='] = function(context) {
        var self = this;
        self.context = context;
        return self.template_name = "block_" + (context);
      };

      def.$render = function() {
        var self = this;
        self.document.$playback_attributes(self.attributes);
        return self.$renderer().$render(self.template_name, self);
      };

      def.$content = function() {
        var $a, $b, TMP_2, self = this;
        return ($a = ($b = self.blocks).$map, $a._p = (TMP_2 = function(b){var self = TMP_2._s || this;if (b == null) b = nil;
        return b.$render()}, TMP_2._s = self, TMP_2), $a).call($b)['$*']($opalScope.EOL);
      };

      def['$sub?'] = function(name) {
        var self = this;
        return self.subs['$include?'](name);
      };

      def['$title?'] = function() {
        var $a, self = this;
        return ($a = self.title.$to_s()['$empty?'](), ($a === nil || $a === false));
      };

      def.$title = function() {
        var $a, $b, self = this;
        if (($a = (($b = self['subbed_title'], $b != null && $b !== nil) ? 'instance-variable' : nil)) !== false && $a !== nil) {
          return self.subbed_title
        } else if (($a = self.title) !== false && $a !== nil) {
          return self.subbed_title = self.$apply_title_subs(self.title)
          } else {
          return self.title
        };
      };

      def.$captioned_title = function() {
        var self = this;
        return "" + (self.caption) + (self.$title());
      };

      def['$blocks?'] = function() {
        var $a, self = this;
        return ($a = self.blocks['$empty?'](), ($a === nil || $a === false));
      };

      def['$<<'] = function(block) {
        var self = this;
        return self.blocks['$<<'](block);
      };

      def.$sections = function() {
        var $a, $b, TMP_3, self = this;
        return ($a = ($b = self.blocks).$opalInject, $a._p = (TMP_3 = function(collector, block){var self = TMP_3._s || this;if (collector == null) collector = nil;if (block == null) block = nil;
        if (block.$context()['$==']("section")) {
            collector['$<<'](block)};
          return collector;}, TMP_3._s = self, TMP_3), $a).call($b, []);
      };

      def.$remove_sub = function(sub) {
        var self = this;
        self.subs.$delete(sub);
        return nil;
      };

      def.$assign_caption = function(caption, key) {
        var $a, $b, self = this, caption_key = nil, caption_title = nil, caption_num = nil;
        if (caption == null) {
          caption = nil
        }
        if (key == null) {
          key = nil
        }
        if (($a = ((($b = self['$title?']()) !== false && $b !== nil) ? $b : self.caption['$nil?']())) === false || $a === nil) {
          return nil};
        if (($a = caption['$nil?']()) !== false && $a !== nil) {
          if (($a = self.document.$attributes()['$has_key?']("caption")) !== false && $a !== nil) {
            self.caption = self.document.$attributes()['$[]']("caption")
          } else if (($a = self['$title?']()) !== false && $a !== nil) {
            ((($a = key) !== false && $a !== nil) ? $a : key = self.context.$to_s());
            caption_key = "" + (key) + "-caption";
            if (($a = self.document.$attributes()['$has_key?'](caption_key)) !== false && $a !== nil) {
              caption_title = self.document.$attributes()['$[]']("" + (key) + "-caption");
              caption_num = self.document.$counter_increment("" + (key) + "-number", self);
              self.caption = "" + (caption_title) + " " + (caption_num) + ". ";};
            } else {
            self.caption = caption
          }
          } else {
          self.caption = caption
        };
        return nil;
      };

      def.$assign_index = function(section) {
        var $a, $b, $c, $d, self = this, appendix_number = nil, caption = nil;
        section['$index='](self.next_section_index);
        self.next_section_index = self.next_section_index['$+'](1);
        if (section.$sectname()['$==']("appendix")) {
          appendix_number = self.document.$counter("appendix-number", "A");
          if (($a = section.$numbered()) !== false && $a !== nil) {
            section['$number='](appendix_number)};
          if (($a = ($b = ((caption = self.document.$attr("appendix-caption", "")))['$=='](""), ($b === nil || $b === false))) !== false && $a !== nil) {
            return section['$caption=']("" + (caption) + " " + (appendix_number) + ": ")
            } else {
            return section['$caption=']("" + (appendix_number) + ". ")
          };
        } else if (($a = section.$numbered()) !== false && $a !== nil) {
          if (($a = ($b = (((($c = section.$level()['$=='](1)) !== false && $c !== nil) ? $c : ((($d = section.$level()['$=='](0)) ? section.$special() : $d)))), $b !== false && $b !== nil ?self.document.$doctype()['$==']("book") : $b)) !== false && $a !== nil) {
            return section['$number='](self.document.$counter("chapter-number", 1))
            } else {
            section['$number='](self.next_section_number);
            return self.next_section_number = self.next_section_number['$+'](1);
          }
          } else {
          return nil
        };
      };

      return (def.$reindex_sections = function() {
        var $a, $b, TMP_4, self = this;
        self.next_section_index = 0;
        self.next_section_number = 0;
        return ($a = ($b = self.blocks).$each, $a._p = (TMP_4 = function(block){var self = TMP_4._s || this;if (block == null) block = nil;
        if (block.$context()['$==']("section")) {
            self.$assign_index(block);
            return block.$reindex_sections();
            } else {
            return nil
          }}, TMP_4._s = self, TMP_4), $a).call($b);
      }, nil);
    })(self, $opalScope.AbstractNode)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $AttributeList(){};
      var self = $AttributeList = $klass($base, $super, 'AttributeList', $AttributeList);

      var def = $AttributeList._proto, $opalScope = $AttributeList._scope;
      def.attributes = def.scanner = def.quotes = def.delimiter = def.block = def.escape_char = nil;
      $opal.cdecl($opalScope, 'BOUNDARY_PATTERNS', $hash2(["\"", "'", ","], {"\"": /.*?[^\\](?=")/, "'": /.*?[^\\](?=')/, ",": /.*?(?=[ \t]*(,|$))/}));

      $opal.cdecl($opalScope, 'UNESCAPE_PATTERNS', $hash2(["\\\"", "\\'"], {"\\\"": /\\"/, "\\'": /\\'/}));

      $opal.cdecl($opalScope, 'SKIP_PATTERNS', $hash2(["blank", ","], {"blank": /[ \t]+/, ",": /[ \t]*(,|$)/}));

      $opal.cdecl($opalScope, 'NAME_PATTERN', /[A-Za-z:_][A-Za-z:_\-\.]*/);

      def.$initialize = function(source, block, quotes, delimiter, escape_char) {
        var $a, self = this;
        if (block == null) {
          block = nil
        }
        if (quotes == null) {
          quotes = ["'", "\""]
        }
        if (delimiter == null) {
          delimiter = ","
        }
        if (escape_char == null) {
          escape_char = "\\"
        }
        self.scanner = (($a = $opal.Object._scope.StringScanner) == null ? $opal.cm('StringScanner') : $a).$new(source);
        self.block = block;
        self.quotes = quotes;
        self.escape_char = escape_char;
        self.delimiter = delimiter;
        return self.attributes = nil;
      };

      def.$parse_into = function(attributes, posattrs) {
        var self = this;
        if (posattrs == null) {
          posattrs = []
        }
        return attributes.$update(self.$parse(posattrs));
      };

      def.$parse = function(posattrs) {
        var $a, $b, self = this, index = nil;
        if (posattrs == null) {
          posattrs = []
        }
        if (($a = self.attributes['$nil?']()) === false || $a === nil) {
          return self.attributes};
        self.attributes = $hash2([], {});
        index = 0;
        while (($b = self.$parse_attribute(index, posattrs)) !== false && $b !== nil) {
        if (($b = self.scanner['$eos?']()) !== false && $b !== nil) {
          break;};
        self.$skip_delimiter();
        index = index['$+'](1);};
        return self.attributes;
      };

      def.$rekey = function(posattrs) {
        var self = this;
        return $opalScope.AttributeList.$rekey(self.attributes, posattrs);
      };

      $opal.defs(self, '$rekey', function(attributes, pos_attrs) {
        var $a, $b, TMP_1, self = this;
        ($a = ($b = pos_attrs).$each_with_index, $a._p = (TMP_1 = function(key, index){var self = TMP_1._s || this, $a, pos = nil, val = nil;if (key == null) key = nil;if (index == null) index = nil;
        if (($a = key['$nil?']()) !== false && $a !== nil) {
            return nil;};
          pos = index['$+'](1);
          if (($a = ((val = attributes['$[]'](pos)))['$nil?']()) !== false && $a !== nil) {
            return nil
            } else {
            return attributes['$[]='](key, val)
          };}, TMP_1._s = self, TMP_1), $a).call($b);
        return attributes;
      });

      def.$parse_attribute = function(index, pos_attrs) {
        var $a, $b, $c, TMP_2, $d, self = this, single_quoted_value = nil, first = nil, value = nil, name = nil, skipped = nil, c = nil, remainder = nil, resolved_name = nil, pos_name = nil, resolved_value = nil;
        if (index == null) {
          index = 0
        }
        if (pos_attrs == null) {
          pos_attrs = []
        }
        single_quoted_value = false;
        self.$skip_blank();
        first = self.scanner.$peek(1);
        if (($a = self.quotes['$include?'](first)) !== false && $a !== nil) {
          value = nil;
          name = self.$parse_attribute_value(self.scanner.$get_byte());
          if (first['$==']("'")) {
            single_quoted_value = true};
          } else {
          name = self.$scan_name();
          skipped = 0;
          c = nil;
          if (($a = self.scanner['$eos?']()) !== false && $a !== nil) {
            if (($a = name['$nil?']()) !== false && $a !== nil) {
              return false}
            } else {
            skipped = ((($a = self.$skip_blank()) !== false && $a !== nil) ? $a : 0);
            c = self.scanner.$get_byte();
          };
          if (($a = ((($b = c['$nil?']()) !== false && $b !== nil) ? $b : c['$=='](self.delimiter))) !== false && $a !== nil) {
            value = nil
          } else if (($a = ((($b = ($c = c['$==']("="), ($c === nil || $c === false))) !== false && $b !== nil) ? $b : name['$nil?']())) !== false && $a !== nil) {
            remainder = self.$scan_to_delimiter();
            if (($a = name['$nil?']()) !== false && $a !== nil) {
              name = ""};
            name = name['$+'](" "['$*'](skipped)['$+'](c));
            if (($a = remainder['$nil?']()) === false || $a === nil) {
              name = name['$+'](remainder)};
            value = nil;
            } else {
            self.$skip_blank();
            if (self.scanner.$peek(1)['$=='](self.delimiter)) {
              value = nil
              } else {
              c = self.scanner.$get_byte();
              if (($a = self.quotes['$include?'](c)) !== false && $a !== nil) {
                value = self.$parse_attribute_value(c);
                if (c['$==']("'")) {
                  single_quoted_value = true};
              } else if (($a = ($b = c['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                value = c['$+'](self.$scan_to_delimiter())};
            };
          };
        };
        if (($a = value['$nil?']()) !== false && $a !== nil) {
          resolved_name = (function() {if (($a = (($b = single_quoted_value !== false && single_quoted_value !== nil) ? ($c = self.block['$nil?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
            return self.block.$apply_normal_subs(name)
            } else {
            return name
          }; return nil; })();
          if (($a = ($b = ((pos_name = pos_attrs['$[]'](index)))['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
            self.attributes['$[]='](pos_name, resolved_name)};
          self.attributes['$[]='](index['$+'](1), resolved_name);
          } else {
          resolved_value = value;
          if (($a = ((($b = name['$==']("options")) !== false && $b !== nil) ? $b : name['$==']("opts"))) !== false && $a !== nil) {
            name = "options";
            ($a = ($b = resolved_value.$split(",")).$each, $a._p = (TMP_2 = function(o){var self = TMP_2._s || this;
              if (self.attributes == null) self.attributes = nil;
if (o == null) o = nil;
            return self.attributes['$[]=']("" + (o.$strip()) + "-option", "")}, TMP_2._s = self, TMP_2), $a).call($b);
          } else if (($a = (($c = single_quoted_value !== false && single_quoted_value !== nil) ? ($d = self.block['$nil?'](), ($d === nil || $d === false)) : $c)) !== false && $a !== nil) {
            resolved_value = self.block.$apply_normal_subs(value)};
          self.attributes['$[]='](name, resolved_value);
        };
        return true;
      };

      def.$parse_attribute_value = function(quote) {
        var $a, self = this, value = nil;
        if (self.scanner.$peek(1)['$=='](quote)) {
          self.scanner.$get_byte();
          return "";};
        value = self.$scan_to_quote(quote);
        if (($a = value['$nil?']()) !== false && $a !== nil) {
          return quote['$+'](self.$scan_to_delimiter())
          } else {
          self.scanner.$get_byte();
          return value.$gsub($opalScope.UNESCAPE_PATTERNS['$[]'](self.escape_char['$+'](quote)), quote);
        };
      };

      def.$skip_blank = function() {
        var self = this;
        return self.scanner.$skip($opalScope.SKIP_PATTERNS['$[]']("blank"));
      };

      def.$skip_delimiter = function() {
        var self = this;
        return self.scanner.$skip($opalScope.SKIP_PATTERNS['$[]'](self.delimiter));
      };

      def.$scan_name = function() {
        var self = this;
        return self.scanner.$scan($opalScope.NAME_PATTERN);
      };

      def.$scan_to_delimiter = function() {
        var self = this;
        return self.scanner.$scan($opalScope.BOUNDARY_PATTERNS['$[]'](self.delimiter));
      };

      return (def.$scan_to_quote = function(quote) {
        var self = this;
        return self.scanner.$scan($opalScope.BOUNDARY_PATTERNS['$[]'](quote));
      }, nil);
    })(self, null)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Block(){};
      var self = $Block = $klass($base, $super, 'Block', $Block);

      var def = $Block._proto, $opalScope = $Block._scope, TMP_1, TMP_2;
      def.content_model = def.lines = def.subs = def.blocks = def.context = def.style = nil;
      $opal.defn(self, '$blockname', def.$context);

      self.$attr_accessor("lines");

      def.$initialize = TMP_1 = function(parent, context, opts) {
        var $a, self = this, $iter = TMP_1._p, $yield = $iter || nil, raw_source = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, context]);
        self.content_model = ((($a = opts.$fetch("content_model", nil)) !== false && $a !== nil) ? $a : "simple");
        self.attributes = ((($a = opts.$fetch("attributes", nil)) !== false && $a !== nil) ? $a : $hash2([], {}));
        if (($a = opts['$has_key?']("subs")) !== false && $a !== nil) {
          self.subs = opts['$[]']("subs")};
        raw_source = ((($a = opts.$fetch("source", nil)) !== false && $a !== nil) ? $a : nil);
        if (($a = raw_source['$nil?']()) !== false && $a !== nil) {
          return self.lines = []
        } else if (raw_source.$class()['$==']((($a = $opal.Object._scope.String) == null ? $opal.cm('String') : $a))) {
          return self.lines = $opalScope.Helpers.$normalize_lines_from_string(raw_source)
          } else {
          return self.lines = raw_source.$dup()
        };
      };

      def.$content = TMP_2 = function() {var $zuper = $slice.call(arguments, 0);
        var $a, $b, $c, $d, self = this, $iter = TMP_2._p, $yield = $iter || nil, $case = nil, result = nil, first = nil, last = nil;
        TMP_2._p = null;
        return (function() {$case = self.content_model;if ("compound"['$===']($case)) {return $opal.find_super_dispatcher(self, 'content', TMP_2, $iter).apply(self, $zuper)}else if ("simple"['$===']($case)) {return self.$apply_subs(self.lines.$join($opalScope.EOL), self.subs)}else if ("verbatim"['$===']($case) || "raw"['$===']($case)) {result = self.$apply_subs(self.lines, self.subs);
        if (result.$size()['$<'](2)) {
          return ((($a = result.$first()) !== false && $a !== nil) ? $a : "")
          } else {
          while (($b = ($c = ($d = ((first = result.$first()))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?first.$rstrip()['$empty?']() : $c)) !== false && $b !== nil) {
          result.$shift()};
          while (($b = ($c = ($d = ((last = result.$last()))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?last.$rstrip()['$empty?']() : $c)) !== false && $b !== nil) {
          result.$pop()};
          return result.$join($opalScope.EOL);
        };}else {if (($a = self.content_model['$==']("empty")) === false || $a === nil) {
          self.$warn("Unknown content model '" + (self.content_model) + "' for block: " + (self.$to_s()))};
        return nil;}})();
      };

      def.$source = function() {
        var self = this;
        return self.lines['$*']($opalScope.EOL);
      };

      return (def.$to_s = function() {
        var $a, self = this, content_summary = nil;
        content_summary = (function() {if (self.content_model['$==']("compound")) {
          return "# of blocks = " + (self.blocks.$size())
          } else {
          return "# of lines = " + (self.lines.$size())
        }; return nil; })();
        return "Block[@context: :" + (self.context) + ", @content_model: :" + (self.content_model) + ", @style: " + (((($a = self.style) !== false && $a !== nil) ? $a : "nil")) + ", " + (content_summary) + "]";
      }, nil);
    })(self, $opalScope.AbstractBlock)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Callouts(){};
      var self = $Callouts = $klass($base, $super, 'Callouts', $Callouts);

      var def = $Callouts._proto, $opalScope = $Callouts._scope;
      def.co_index = def.lists = def.list_index = nil;
      def.$initialize = function() {
        var self = this;
        self.lists = [];
        self.list_index = 0;
        return self.$next_list();
      };

      def.$register = function(li_ordinal) {
        var self = this, id = nil;
        self.$current_list()['$<<']($hash2(["ordinal", "id"], {"ordinal": li_ordinal.$to_i(), "id": (id = self.$generate_next_callout_id())}));
        self.co_index = self.co_index['$+'](1);
        return id;
      };

      def.$read_next_id = function() {
        var self = this, id = nil, list = nil;
        id = nil;
        list = self.$current_list();
        if (self.co_index['$<='](list.$size())) {
          id = list['$[]'](self.co_index['$-'](1))['$[]']("id")};
        self.co_index = self.co_index['$+'](1);
        return id;
      };

      def.$callout_ids = function(li_ordinal) {
        var $a, $b, TMP_1, self = this;
        return ($a = ($b = self.$current_list()).$opalInject, $a._p = (TMP_1 = function(collector, element){var self = TMP_1._s || this;if (collector == null) collector = nil;if (element == null) element = nil;
        if (element['$[]']("ordinal")['$=='](li_ordinal)) {
            collector['$<<'](element['$[]']("id"))};
          return collector;}, TMP_1._s = self, TMP_1), $a).call($b, [])['$*'](" ");
      };

      def.$current_list = function() {
        var self = this;
        return self.lists['$[]'](self.list_index['$-'](1));
      };

      def.$next_list = function() {
        var self = this;
        self.list_index = self.list_index['$+'](1);
        if (self.lists.$size()['$<'](self.list_index)) {
          self.lists['$<<']([])};
        self.co_index = 1;
        return nil;
      };

      def.$rewind = function() {
        var self = this;
        self.list_index = 1;
        self.co_index = 1;
        return nil;
      };

      def.$generate_next_callout_id = function() {
        var self = this;
        return self.$generate_callout_id(self.list_index, self.co_index);
      };

      return (def.$generate_callout_id = function(list_index, co_index) {
        var self = this;
        return "CO" + (list_index) + "-" + (co_index);
      }, nil);
    })(self, null)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $range = $opal.range, $gvars = $opal.gvars;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Document(){};
      var self = $Document = $klass($base, $super, 'Document', $Document);

      var def = $Document._proto, $opalScope = $Document._scope, TMP_1, TMP_9, TMP_14, TMP_15;
      def.parent_document = def.safe = def.options = def.attributes = def.attribute_overrides = def.base_dir = def.extensions = def.reader = def.callouts = def.counters = def.references = def.header = def.blocks = def.attributes_modified = def.id = def.original_attributes = def.renderer = nil;
      $opal.cdecl($opalScope, 'Footnote', $opalScope.Struct.$new("index", "id", "text"));

      (function($base, $super) {
        function $AttributeEntry(){};
        var self = $AttributeEntry = $klass($base, $super, 'AttributeEntry', $AttributeEntry);

        var def = $AttributeEntry._proto, $opalScope = $AttributeEntry._scope;
        self.$attr_reader("name", "value", "negate");

        def.$initialize = function(name, value, negate) {
          var $a, self = this;
          if (negate == null) {
            negate = nil
          }
          self.name = name;
          self.value = value;
          return self.negate = (function() {if (($a = negate['$nil?']()) !== false && $a !== nil) {
            return value['$nil?']()
            } else {
            return negate
          }; return nil; })();
        };

        return (def.$save_to = function(block_attributes) {
          var $a, $b, $c, self = this;
          return (($a = "attribute_entries", $b = block_attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))))['$<<'](self);
        }, nil);
      })(self, null);

      self.$attr_reader("safe");

      self.$attr_reader("references");

      self.$attr_reader("counters");

      self.$attr_reader("callouts");

      self.$attr_reader("header");

      self.$attr_reader("base_dir");

      self.$attr_reader("parent_document");

      self.$attr_reader("extensions");

      def.$initialize = TMP_1 = function(data, options) {
        var $a, $b, $c, TMP_2, TMP_3, $f, $g, TMP_4, $h, TMP_5, $i, TMP_6, $j, $k, TMP_7, self = this, $iter = TMP_1._p, $yield = $iter || nil, initialize_extensions = nil, safe_mode = nil, safe_mode_name = nil, now = nil;
        if (data == null) {
          data = []
        }
        if (options == null) {
          options = $hash2([], {})
        }
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [self, "document"]);
        if (($a = options['$[]']("parent")) !== false && $a !== nil) {
          self.parent_document = options.$delete("parent");
          ($a = "base_dir", $b = options, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, self.parent_document.$base_dir())));
          self.references = ($a = ($b = self.parent_document.$references()).$opalInject, $a._p = (TMP_2 = function(collector, $d){var self = TMP_2._s || this;if (collector == null) collector = nil;key = $d[0];ref = $d[1];
          if (key['$==']("footnotes")) {
              collector['$[]=']("footnotes", [])
              } else {
              collector['$[]='](key, ref)
            };
            return collector;}, TMP_2._s = self, TMP_2), $a).call($b, $hash2([], {}));
          self.attribute_overrides = self.parent_document.$attributes().$dup();
          self.safe = self.parent_document.$safe();
          self.renderer = self.parent_document.$renderer();
          initialize_extensions = false;
          self.extensions = self.parent_document.$extensions();
          } else {
          self.parent_document = nil;
          self.references = $hash2(["ids", "footnotes", "links", "images", "indexterms", "includes"], {"ids": $hash2([], {}), "footnotes": [], "links": [], "images": [], "indexterms": [], "includes": $opalScope.Set.$new()});
          self.attribute_overrides = ($a = ($c = (((($f = options['$[]']("attributes")) !== false && $f !== nil) ? $f : $hash2([], {})))).$opalInject, $a._p = (TMP_3 = function(collector, $e){var self = TMP_3._s || this, $a, key = nil, value = nil;if (collector == null) collector = nil;key = $e[0];value = $e[1];
          if (($a = key['$start_with?']("!")) !== false && $a !== nil) {
              key = key['$[]']($range(1, -1, false));
              value = nil;
            } else if (($a = key['$end_with?']("!")) !== false && $a !== nil) {
              key = key['$[]']($range(0, -2, false));
              value = nil;};
            collector['$[]='](key.$downcase(), value);
            return collector;}, TMP_3._s = self, TMP_3), $a).call($c, $hash2([], {}));
          self.safe = nil;
          self.renderer = nil;
          initialize_extensions = ($a = $opalScope.Asciidoctor['$const_defined?']("Extensions"), $a !== false && $a !== nil ?$opalScope.Asciidoctor.$const_get("Extensions")['$=='](((($f = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $f))._scope.Extensions) : $a);
          self.extensions = nil;
        };
        self.header = nil;
        self.counters = $hash2([], {});
        self.callouts = $opalScope.Callouts.$new();
        self.attributes_modified = $opalScope.Set.$new();
        self.options = options;
        if (($a = self.parent_document) === false || $a === nil) {
          if (($a = ($f = self.safe['$nil?'](), $f !== false && $f !== nil ?($g = (safe_mode = self.options['$[]']("safe")), ($g === nil || $g === false)) : $f)) !== false && $a !== nil) {
            self.safe = ($opalScope.SafeMode)._scope.SECURE
          } else if (($a = safe_mode['$is_a?']($opalScope.Fixnum)) !== false && $a !== nil) {
            self.safe = safe_mode
            } else {
            try {
            self.safe = $opalScope.SafeMode.$const_get(safe_mode.$to_s().$upcase()).$to_i()
            } catch ($err) {if (true) {
              self.safe = ($opalScope.SafeMode)._scope.SECURE.$to_i()
              }else { throw $err; }
            }
          }};
        self.options['$[]=']("header_footer", self.options.$fetch("header_footer", false));
        self.attributes['$[]=']("encoding", "UTF-8");
        self.attributes['$[]=']("sectids", "");
        if (($a = self.options['$[]']("header_footer")) === false || $a === nil) {
          self.attributes['$[]=']("notitle", "")};
        self.attributes['$[]=']("toc-placement", "auto");
        self.attributes['$[]=']("stylesheet", "");
        if (($a = self.options['$[]']("header_footer")) !== false && $a !== nil) {
          self.attributes['$[]=']("copycss", "")};
        self.attributes['$[]=']("prewrap", "");
        self.attributes['$[]=']("attribute-undefined", $opalScope.Compliance.$attribute_undefined());
        self.attributes['$[]=']("attribute-missing", $opalScope.Compliance.$attribute_missing());
        self.attributes['$[]=']("caution-caption", "Caution");
        self.attributes['$[]=']("important-caption", "Important");
        self.attributes['$[]=']("note-caption", "Note");
        self.attributes['$[]=']("tip-caption", "Tip");
        self.attributes['$[]=']("warning-caption", "Warning");
        self.attributes['$[]=']("appendix-caption", "Appendix");
        self.attributes['$[]=']("example-caption", "Example");
        self.attributes['$[]=']("figure-caption", "Figure");
        self.attributes['$[]=']("table-caption", "Table");
        self.attributes['$[]=']("toc-title", "Table of Contents");
        self.attributes['$[]=']("manname-title", "NAME");
        self.attributes['$[]=']("untitled-label", "Untitled");
        self.attributes['$[]=']("version-label", "Version");
        self.attributes['$[]=']("last-update-label", "Last updated");
        self.attribute_overrides['$[]=']("asciidoctor", "");
        self.attribute_overrides['$[]=']("asciidoctor-version", $opalScope.VERSION);
        safe_mode_name = ($a = ($f = $opalScope.SafeMode.$constants()).$detect, $a._p = (TMP_4 = function(l){var self = TMP_4._s || this;
          if (self.safe == null) self.safe = nil;
if (l == null) l = nil;
        return $opalScope.SafeMode.$const_get(l)['$=='](self.safe)}, TMP_4._s = self, TMP_4), $a).call($f).$to_s().$downcase();
        self.attribute_overrides['$[]=']("safe-mode-name", safe_mode_name);
        self.attribute_overrides['$[]=']("safe-mode-" + (safe_mode_name), "");
        self.attribute_overrides['$[]=']("safe-mode-level", self.safe);
        self.attribute_overrides['$[]=']("embedded", (function() {if (($a = self.options['$[]']("header_footer")) !== false && $a !== nil) {
          return nil
          } else {
          return ""
        }; return nil; })());
        ($a = "max-include-depth", $g = self.attribute_overrides, ((($h = $g['$[]']($a)) !== false && $h !== nil) ? $h : $g['$[]=']($a, 64)));
        if (($a = ($g = self.attribute_overrides['$[]']("allow-uri-read")['$nil?'](), ($g === nil || $g === false))) === false || $a === nil) {
          self.attribute_overrides['$[]=']("allow-uri-read", nil)};
        self.attribute_overrides['$[]=']("user-home", $opalScope.USER_HOME);
        if (($a = self.options['$[]']("base_dir")['$nil?']()) !== false && $a !== nil) {
          if (($a = self.attribute_overrides['$[]']("docdir")) !== false && $a !== nil) {
            self.base_dir = self.attribute_overrides['$[]=']("docdir", $opalScope.File.$expand_path(self.attribute_overrides['$[]']("docdir")))
            } else {
            self.base_dir = self.attribute_overrides['$[]=']("docdir", $opalScope.File.$expand_path($opalScope.Dir.$pwd()))
          }
          } else {
          self.base_dir = self.attribute_overrides['$[]=']("docdir", $opalScope.File.$expand_path(self.options['$[]']("base_dir")))
        };
        if (($a = self.options['$[]']("backend")['$nil?']()) === false || $a === nil) {
          self.attribute_overrides['$[]=']("backend", self.options['$[]']("backend").$to_s())};
        if (($a = self.options['$[]']("doctype")['$nil?']()) === false || $a === nil) {
          self.attribute_overrides['$[]=']("doctype", self.options['$[]']("doctype").$to_s())};
        if (self.safe['$>='](($opalScope.SafeMode)._scope.SERVER)) {
          ($a = "copycss", $g = self.attribute_overrides, ((($h = $g['$[]']($a)) !== false && $h !== nil) ? $h : $g['$[]=']($a, nil)));
          ($a = "source-highlighter", $g = self.attribute_overrides, ((($h = $g['$[]']($a)) !== false && $h !== nil) ? $h : $g['$[]=']($a, nil)));
          ($a = "backend", $g = self.attribute_overrides, ((($h = $g['$[]']($a)) !== false && $h !== nil) ? $h : $g['$[]=']($a, $opalScope.DEFAULT_BACKEND)));
          if (($a = ($g = ($h = self.parent_document, ($h === nil || $h === false)), $g !== false && $g !== nil ?self.attribute_overrides['$has_key?']("docfile") : $g)) !== false && $a !== nil) {
            self.attribute_overrides['$[]=']("docfile", self.attribute_overrides['$[]']("docfile")['$[]']($range((self.attribute_overrides['$[]']("docdir").$length()['$+'](1)), -1, false)))};
          self.attribute_overrides['$[]=']("docdir", "");
          self.attribute_overrides['$[]=']("user-home", ".");
          if (self.safe['$>='](($opalScope.SafeMode)._scope.SECURE)) {
            if (($a = self.attribute_overrides.$fetch("linkcss", "")['$nil?']()) === false || $a === nil) {
              self.attribute_overrides['$[]=']("linkcss", "")};
            ($a = "icons", $g = self.attribute_overrides, ((($h = $g['$[]']($a)) !== false && $h !== nil) ? $h : $g['$[]=']($a, nil)));};};
        ($a = ($g = self.attribute_overrides).$delete_if, $a._p = (TMP_5 = function(key, val){var self = TMP_5._s || this, $a, $b, verdict = nil;
          if (self.attributes == null) self.attributes = nil;
if (key == null) key = nil;if (val == null) val = nil;
        verdict = false;
          if (($a = val['$nil?']()) !== false && $a !== nil) {
            self.attributes.$delete(key)
            } else {
            if (($a = ($b = val['$is_a?']($opalScope.String), $b !== false && $b !== nil ?val['$end_with?']("@") : $b)) !== false && $a !== nil) {
              val = val.$chop();
              verdict = true;};
            self.attributes['$[]='](key, val);
          };
          return verdict;}, TMP_5._s = self, TMP_5), $a).call($g);
        if (($a = ($h = self.parent_document, ($h === nil || $h === false))) !== false && $a !== nil) {
          ($a = "backend", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, $opalScope.DEFAULT_BACKEND)));
          ($a = "doctype", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, $opalScope.DEFAULT_DOCTYPE)));
          self.$update_backend_attributes();
          now = $opalScope.Time.$new();
          ($a = "localdate", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, now.$strftime("%Y-%m-%d"))));
          ($a = "localtime", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, now.$strftime("%H:%M:%S %Z"))));
          ($a = "localdatetime", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, "" + (self.attributes['$[]']("localdate")) + " " + (self.attributes['$[]']("localtime")))));
          ($a = "docdate", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, self.attributes['$[]']("localdate"))));
          ($a = "doctime", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, self.attributes['$[]']("localtime"))));
          ($a = "docdatetime", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, self.attributes['$[]']("localdatetime"))));
          ($a = "stylesdir", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, ".")));
          ($a = "iconsdir", $h = self.attributes, ((($i = $h['$[]']($a)) !== false && $i !== nil) ? $i : $h['$[]=']($a, $opalScope.File.$join(self.attributes.$fetch("imagesdir", "./images"), "icons"))));
          self.extensions = (function() {if (initialize_extensions !== false && initialize_extensions !== nil) {
            return ($opalScope.Extensions)._scope.Registry.$new(self)
            } else {
            return nil
          }; return nil; })();
          self.reader = $opalScope.PreprocessorReader.$new(self, data, (($opalScope.Asciidoctor)._scope.Reader)._scope.Cursor.$new(self.attributes['$[]']("docfile"), self.base_dir));
          if (($a = ($h = self.extensions, $h !== false && $h !== nil ?self.extensions['$preprocessors?']() : $h)) !== false && $a !== nil) {
            ($a = ($h = self.extensions.$load_preprocessors(self)).$each, $a._p = (TMP_6 = function(processor){var self = TMP_6._s || this, $a;
              if (self.reader == null) self.reader = nil;
if (processor == null) processor = nil;
            return self.reader = ((($a = processor.$process(self.reader, self.reader.$lines())) !== false && $a !== nil) ? $a : self.reader)}, TMP_6._s = self, TMP_6), $a).call($h)};
          } else {
          self.reader = $opalScope.Reader.$new(data, options['$[]']("cursor"))
        };
        $opalScope.Lexer.$parse(self.reader, self, $hash2(["header_only"], {"header_only": self.options.$fetch("parse_header_only", false)}));
        self.callouts.$rewind();
        if (($a = ($i = ($j = ($k = self.parent_document, ($k === nil || $k === false)), $j !== false && $j !== nil ?self.extensions : $j), $i !== false && $i !== nil ?self.extensions['$treeprocessors?']() : $i)) !== false && $a !== nil) {
          return ($a = ($i = self.extensions.$load_treeprocessors(self)).$each, $a._p = (TMP_7 = function(processor){var self = TMP_7._s || this;if (processor == null) processor = nil;
          return processor.$process()}, TMP_7._s = self, TMP_7), $a).call($i)
          } else {
          return nil
        };
      };

      def.$counter = function(name, seed) {
        var $a, $b, self = this;
        if (seed == null) {
          seed = nil
        }
        if (($a = ($b = self.counters['$has_key?'](name), ($b === nil || $b === false))) !== false && $a !== nil) {
          if (($a = seed['$nil?']()) !== false && $a !== nil) {
            seed = self.$nextval((function() {if (($a = self.attributes['$has_key?'](name)) !== false && $a !== nil) {
              return self.attributes['$[]'](name)
              } else {
              return 0
            }; return nil; })())
          } else if (seed.$to_i().$to_s()['$=='](seed)) {
            seed = seed.$to_i()};
          self.counters['$[]='](name, seed);
          } else {
          self.counters['$[]='](name, self.$nextval(self.counters['$[]'](name)))
        };
        return (self.attributes['$[]='](name, self.counters['$[]'](name)));
      };

      def.$counter_increment = function(counter_name, block) {
        var self = this, val = nil;
        val = self.$counter(counter_name);
        $opalScope.AttributeEntry.$new(counter_name, val).$save_to(block.$attributes());
        return val;
      };

      def.$nextval = function(current) {
        var $a, $b, self = this, intval = nil;
        if (($a = current['$is_a?']($opalScope.Integer)) !== false && $a !== nil) {
          return current['$+'](1)
          } else {
          intval = current.$to_i();
          if (($a = ($b = intval.$to_s()['$=='](current.$to_s()), ($b === nil || $b === false))) !== false && $a !== nil) {
            return (current['$[]'](0).$ord()['$+'](1)).$chr()
            } else {
            return intval['$+'](1)
          };
        };
      };

      def.$register = function(type, value) {
        var $a, self = this, $case = nil;
        return (function() {$case = type;if ("ids"['$===']($case)) {if (($a = value['$is_a?']($opalScope.Array)) !== false && $a !== nil) {
          return self.references['$[]']("ids")['$[]='](value['$[]'](0), (((($a = value['$[]'](1)) !== false && $a !== nil) ? $a : "["['$+'](value['$[]'](0))['$+']("]"))))
          } else {
          return self.references['$[]']("ids")['$[]='](value, "["['$+'](value)['$+']("]"))
        }}else if ("footnotes"['$===']($case) || "indexterms"['$===']($case)) {return self.references['$[]'](type)['$<<'](value)}else {if (($a = self.options['$[]']("catalog_assets")) !== false && $a !== nil) {
          return self.references['$[]'](type)['$<<'](value)
          } else {
          return nil
        }}})();
      };

      def['$footnotes?'] = function() {
        var $a, self = this;
        return ($a = self.references['$[]']("footnotes")['$empty?'](), ($a === nil || $a === false));
      };

      def.$footnotes = function() {
        var self = this;
        return self.references['$[]']("footnotes");
      };

      def['$nested?'] = function() {
        var $a, self = this;
        if (($a = self.parent_document) !== false && $a !== nil) {
          return true
          } else {
          return false
        };
      };

      def['$embedded?'] = function() {
        var self = this;
        return self.attributes['$has_key?']("embedded");
      };

      def['$extensions?'] = function() {
        var $a, self = this;
        if (($a = self.extensions) !== false && $a !== nil) {
          return true
          } else {
          return false
        };
      };

      def.$source = function() {
        var $a, self = this;
        if (($a = self.reader) !== false && $a !== nil) {
          return self.reader.$source()
          } else {
          return nil
        };
      };

      def.$source_lines = function() {
        var $a, self = this;
        if (($a = self.reader) !== false && $a !== nil) {
          return self.reader.$source_lines()
          } else {
          return nil
        };
      };

      def.$doctype = function() {
        var self = this;
        return self.attributes['$[]']("doctype");
      };

      def.$backend = function() {
        var self = this;
        return self.attributes['$[]']("backend");
      };

      def['$basebackend?'] = function(base) {
        var self = this;
        return self.attributes['$[]']("basebackend")['$=='](base);
      };

      def.$title = function() {
        var self = this;
        return self.attributes['$[]']("title");
      };

      def['$title='] = function(title) {
        var $a, self = this;
        ((($a = self.header) !== false && $a !== nil) ? $a : self.header = $opalScope.Section.$new(self, 0));
        return self.header['$title='](title);
      };

      def.$doctitle = function(opts) {
        var $a, $b, $c, self = this, val = nil, sect = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = ($b = ((val = self.attributes.$fetch("title", "")))['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          val = self.$title()
        } else if (($a = ($b = ($c = ((sect = self.$first_section()))['$nil?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?sect['$title?']() : $b)) !== false && $a !== nil) {
          val = sect.$title()
          } else {
          return nil
        };
        if (($a = ($b = opts['$[]']("sanitize"), $b !== false && $b !== nil ?val['$include?']("<") : $b)) !== false && $a !== nil) {
          return val.$gsub(/<[^>]+>/, "").$tr_s(" ", " ").$strip()
          } else {
          return val
        };
      };

      $opal.defn(self, '$name', def.$doctitle);

      def.$author = function() {
        var self = this;
        return self.attributes['$[]']("author");
      };

      def.$revdate = function() {
        var self = this;
        return self.attributes['$[]']("revdate");
      };

      def.$notitle = function() {
        var $a, $b, self = this;
        return ($a = ($b = self.attributes['$has_key?']("showtitle"), ($b === nil || $b === false)), $a !== false && $a !== nil ?self.attributes['$has_key?']("notitle") : $a);
      };

      def.$noheader = function() {
        var self = this;
        return self.attributes['$has_key?']("noheader");
      };

      def.$nofooter = function() {
        var self = this;
        return self.attributes['$has_key?']("nofooter");
      };

      def.$first_section = function() {
        var $a, $b, TMP_8, $c, self = this;
        if (($a = self['$has_header?']()) !== false && $a !== nil) {
          return self.header
          } else {
          return ($a = ($b = (((($c = self.blocks) !== false && $c !== nil) ? $c : []))).$detect, $a._p = (TMP_8 = function(e){var self = TMP_8._s || this;if (e == null) e = nil;
          return e.$context()['$==']("section")}, TMP_8._s = self, TMP_8), $a).call($b)
        };
      };

      def['$has_header?'] = function() {
        var $a, self = this;
        if (($a = self.header) !== false && $a !== nil) {
          return true
          } else {
          return false
        };
      };

      def['$<<'] = TMP_9 = function(block) {var $zuper = $slice.call(arguments, 0);
        var self = this, $iter = TMP_9._p, $yield = $iter || nil;
        TMP_9._p = null;
        $opal.find_super_dispatcher(self, '<<', TMP_9, $iter).apply(self, $zuper);
        if (block.$context()['$==']("section")) {
          return self.$assign_index(block)
          } else {
          return nil
        };
      };

      def.$finalize_header = function(unrooted_attributes, header_valid) {
        var $a, self = this;
        if (header_valid == null) {
          header_valid = true
        }
        self.$clear_playback_attributes(unrooted_attributes);
        self.$save_attributes();
        if (($a = header_valid) === false || $a === nil) {
          unrooted_attributes['$[]=']("invalid-header", true)};
        return unrooted_attributes;
      };

      def.$save_attributes = function() {
        var $a, $b, $c, $d, $e, TMP_10, TMP_11, self = this, val = nil, toc_val = nil, toc2_val = nil, toc_position_val = nil, default_toc_position = nil, default_toc_class = nil, position = nil, $case = nil;
        if (self.attributes['$[]']("basebackend")['$==']("docbook")) {
          if (($a = ((($b = self['$attribute_locked?']("toc")) !== false && $b !== nil) ? $b : self.attributes_modified['$include?']("toc"))) === false || $a === nil) {
            self.attributes['$[]=']("toc", "")};
          if (($a = ((($b = self['$attribute_locked?']("numbered")) !== false && $b !== nil) ? $b : self.attributes_modified['$include?']("numbered"))) === false || $a === nil) {
            self.attributes['$[]=']("numbered", "")};};
        if (($a = ((($b = self.attributes['$has_key?']("doctitle")) !== false && $b !== nil) ? $b : ((val = self.$doctitle()))['$nil?']())) === false || $a === nil) {
          self.attributes['$[]=']("doctitle", val)};
        if (($a = ($b = ($c = self.id, ($c === nil || $c === false)), $b !== false && $b !== nil ?self.attributes['$has_key?']("css-signature") : $b)) !== false && $a !== nil) {
          self.id = self.attributes['$[]']("css-signature")};
        toc_val = self.attributes['$[]']("toc");
        toc2_val = self.attributes['$[]']("toc2");
        toc_position_val = self.attributes['$[]']("toc-position");
        if (($a = ((($b = (($c = ($d = toc_val['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?(((($d = ($e = toc_val['$=='](""), ($e === nil || $e === false))) !== false && $d !== nil) ? $d : ($e = toc_position_val.$to_s()['$=='](""), ($e === nil || $e === false)))) : $c))) !== false && $b !== nil) ? $b : ($c = toc2_val['$nil?'](), ($c === nil || $c === false)))) !== false && $a !== nil) {
          default_toc_position = "left";
          default_toc_class = "toc2";
          position = ($a = ($b = [toc_position_val, toc2_val, toc_val]).$find, $a._p = (TMP_10 = function(pos){var self = TMP_10._s || this, $a;if (pos == null) pos = nil;
          return ($a = pos.$to_s()['$=='](""), ($a === nil || $a === false))}, TMP_10._s = self, TMP_10), $a).call($b);
          if (($a = ($c = ($d = position, ($d === nil || $d === false)), $c !== false && $c !== nil ?($d = toc2_val['$nil?'](), ($d === nil || $d === false)) : $c)) !== false && $a !== nil) {
            position = default_toc_position};
          self.attributes['$[]=']("toc", "");
          $case = position;if ("left"['$===']($case) || "<"['$===']($case) || "&lt;"['$===']($case)) {self.attributes['$[]=']("toc-position", "left")}else if ("right"['$===']($case) || ">"['$===']($case) || "&gt;"['$===']($case)) {self.attributes['$[]=']("toc-position", "right")}else if ("top"['$===']($case) || "^"['$===']($case)) {self.attributes['$[]=']("toc-position", "top")}else if ("bottom"['$===']($case) || "v"['$===']($case)) {self.attributes['$[]=']("toc-position", "bottom")}else if ("center"['$===']($case)) {self.attributes.$delete("toc2");
          default_toc_class = nil;
          default_toc_position = "center";};
          if (default_toc_class !== false && default_toc_class !== nil) {
            ($a = "toc-class", $c = self.attributes, ((($d = $c['$[]']($a)) !== false && $d !== nil) ? $d : $c['$[]=']($a, default_toc_class)))};
          if (default_toc_position !== false && default_toc_position !== nil) {
            ($a = "toc-position", $c = self.attributes, ((($d = $c['$[]']($a)) !== false && $d !== nil) ? $d : $c['$[]=']($a, default_toc_position)))};};
        self.original_attributes = self.attributes.$dup();
        if (($a = self['$nested?']()) !== false && $a !== nil) {
          return nil
          } else {
          return ($a = ($c = $opalScope.FLEXIBLE_ATTRIBUTES).$each, $a._p = (TMP_11 = function(name){var self = TMP_11._s || this, $a, $b, $c;
            if (self.attribute_overrides == null) self.attribute_overrides = nil;
if (name == null) name = nil;
          if (($a = ($b = self.attribute_overrides['$has_key?'](name), $b !== false && $b !== nil ?($c = self.attribute_overrides['$[]'](name)['$nil?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
              return self.attribute_overrides.$delete(name)
              } else {
              return nil
            }}, TMP_11._s = self, TMP_11), $a).call($c)
        };
      };

      def.$restore_attributes = function() {
        var self = this;
        return self.attributes = self.original_attributes;
      };

      def.$clear_playback_attributes = function(attributes) {
        var self = this;
        return attributes.$delete("attribute_entries");
      };

      def.$playback_attributes = function(block_attributes) {
        var $a, $b, TMP_12, self = this;
        if (($a = block_attributes['$has_key?']("attribute_entries")) !== false && $a !== nil) {
          return ($a = ($b = block_attributes['$[]']("attribute_entries")).$each, $a._p = (TMP_12 = function(entry){var self = TMP_12._s || this, $a;
            if (self.attributes == null) self.attributes = nil;
if (entry == null) entry = nil;
          if (($a = entry.$negate()) !== false && $a !== nil) {
              return self.attributes.$delete(entry.$name())
              } else {
              return self.attributes['$[]='](entry.$name(), entry.$value())
            }}, TMP_12._s = self, TMP_12), $a).call($b)
          } else {
          return nil
        };
      };

      def.$set_attribute = function(name, value) {
        var $a, self = this;
        if (($a = self['$attribute_locked?'](name)) !== false && $a !== nil) {
          return false
          } else {
          self.attributes['$[]='](name, self.$apply_attribute_value_subs(value));
          self.attributes_modified['$<<'](name);
          if (name['$==']("backend")) {
            self.$update_backend_attributes()};
          return true;
        };
      };

      def.$delete_attribute = function(name) {
        var $a, self = this;
        if (($a = self['$attribute_locked?'](name)) !== false && $a !== nil) {
          return false
          } else {
          self.attributes.$delete(name);
          self.attributes_modified['$<<'](name);
          return true;
        };
      };

      def['$attribute_locked?'] = function(name) {
        var self = this;
        return self.attribute_overrides['$has_key?'](name);
      };

      def.$apply_attribute_value_subs = function(value) {
        var $a, $b, self = this, m = nil, subs = nil;
        if (($a = value.$match($opalScope.REGEXP['$[]']("pass_macro_basic"))) !== false && $a !== nil) {
          m = $gvars["~"];
          if (($a = ($b = m['$[]'](1)['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
            subs = self.$resolve_pass_subs(m['$[]'](1));
            if (($a = subs['$empty?']()) !== false && $a !== nil) {
              return m['$[]'](2)
              } else {
              return self.$apply_subs(m['$[]'](2), subs)
            };
            } else {
            return m['$[]'](2)
          };
          } else {
          return self.$apply_header_subs(value)
        };
      };

      def.$update_backend_attributes = function() {
        var $a, self = this, backend = nil, basebackend = nil, page_width = nil, ext = nil, file_type = nil;
        backend = self.attributes['$[]']("backend");
        if (($a = backend['$start_with?']("xhtml")) !== false && $a !== nil) {
          self.attributes['$[]=']("htmlsyntax", "xml");
          backend = self.attributes['$[]=']("backend", backend['$[]']($range(1, -1, false)));
        } else if (($a = backend['$start_with?']("html")) !== false && $a !== nil) {
          self.attributes['$[]=']("htmlsyntax", "html")};
        if (($a = $opalScope.BACKEND_ALIASES['$has_key?'](backend)) !== false && $a !== nil) {
          backend = self.attributes['$[]=']("backend", $opalScope.BACKEND_ALIASES['$[]'](backend))};
        basebackend = backend.$sub($opalScope.REGEXP['$[]']("trailing_digit"), "");
        page_width = $opalScope.DEFAULT_PAGE_WIDTHS['$[]'](basebackend);
        if (page_width !== false && page_width !== nil) {
          self.attributes['$[]=']("pagewidth", page_width)
          } else {
          self.attributes.$delete("pagewidth")
        };
        self.attributes['$[]=']("backend-" + (backend), "");
        self.attributes['$[]=']("basebackend", basebackend);
        self.attributes['$[]=']("basebackend-" + (basebackend), "");
        self.attributes['$[]=']("" + (backend) + "-" + (self.attributes['$[]']("doctype")), "");
        self.attributes['$[]=']("" + (basebackend) + "-" + (self.attributes['$[]']("doctype")), "");
        ext = ((($a = $opalScope.DEFAULT_EXTENSIONS['$[]'](basebackend)) !== false && $a !== nil) ? $a : ".html");
        self.attributes['$[]=']("outfilesuffix", ext);
        file_type = ext['$[]']($range(1, -1, false));
        self.attributes['$[]=']("filetype", file_type);
        return self.attributes['$[]=']("filetype-" + (file_type), "");
      };

      def.$renderer = function(opts) {
        var $a, self = this, render_options = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = self.renderer) !== false && $a !== nil) {
          return self.renderer};
        render_options = $hash2([], {});
        if (($a = self.options['$has_key?']("template_dir")) !== false && $a !== nil) {
          render_options['$[]=']("template_dirs", [self.options['$[]']("template_dir")])
        } else if (($a = self.options['$has_key?']("template_dirs")) !== false && $a !== nil) {
          render_options['$[]=']("template_dirs", self.options['$[]']("template_dirs"))};
        render_options['$[]=']("template_cache", self.options.$fetch("template_cache", true));
        render_options['$[]=']("backend", self.attributes.$fetch("backend", "html5"));
        render_options['$[]=']("htmlsyntax", self.attributes['$[]']("htmlsyntax"));
        render_options['$[]=']("template_engine", self.options['$[]']("template_engine"));
        render_options['$[]=']("eruby", self.options.$fetch("eruby", "erb"));
        render_options['$[]=']("compact", self.options.$fetch("compact", false));
        render_options['$merge!'](opts);
        return self.renderer = $opalScope.Renderer.$new(render_options);
      };

      def.$render = function(opts) {
        var $a, $b, $c, TMP_13, self = this, r = nil, block = nil, output = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        self.$restore_attributes();
        r = self.$renderer(opts);
        if (self.$doctype()['$==']("inline")) {
          if (($a = ($b = ($c = ((block = self.blocks.$first()))['$nil?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = block.$content_model()['$==']("compound"), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
            output = block.$content()
            } else {
            output = ""
          }
          } else {
          output = (function() {if (($a = self.options.$merge(opts)['$[]']("header_footer")) !== false && $a !== nil) {
            return r.$render("document", self).$strip()
            } else {
            return r.$render("embedded", self)
          }; return nil; })()
        };
        if (($a = ($b = ($c = self.parent_document, ($c === nil || $c === false)), $b !== false && $b !== nil ?self.extensions : $b)) !== false && $a !== nil) {
          if (($a = self.extensions['$postprocessors?']()) !== false && $a !== nil) {
            ($a = ($b = self.extensions.$load_postprocessors(self)).$each, $a._p = (TMP_13 = function(processor){var self = TMP_13._s || this;if (processor == null) processor = nil;
            return output = processor.$process(output)}, TMP_13._s = self, TMP_13), $a).call($b)};
          self.extensions.$reset();};
        return output;
      };

      def.$content = TMP_14 = function() {var $zuper = $slice.call(arguments, 0);
        var self = this, $iter = TMP_14._p, $yield = $iter || nil;
        TMP_14._p = null;
        self.attributes.$delete("title");
        return $opal.find_super_dispatcher(self, 'content', TMP_14, $iter).apply(self, $zuper);
      };

      def.$docinfo = function(pos, ext) {
        var $a, $b, $c, self = this, $case = nil, qualifier = nil, content = nil, docinfo = nil, docinfo1 = nil, docinfo2 = nil, docinfo_filename = nil, docinfo_path = nil, content2 = nil;
        if (pos == null) {
          pos = "header"
        }
        if (ext == null) {
          ext = nil
        }
        if (self.$safe()['$>='](($opalScope.SafeMode)._scope.SECURE)) {
          return ""
          } else {
          $case = pos;if ("footer"['$===']($case)) {qualifier = "-footer"}else {qualifier = nil};
          if (($a = ext['$nil?']()) !== false && $a !== nil) {
            ext = self.attributes['$[]']("outfilesuffix")};
          content = nil;
          docinfo = self.attributes['$has_key?']("docinfo");
          docinfo1 = self.attributes['$has_key?']("docinfo1");
          docinfo2 = self.attributes['$has_key?']("docinfo2");
          docinfo_filename = "docinfo" + (qualifier) + (ext);
          if (($a = ((($b = docinfo1) !== false && $b !== nil) ? $b : docinfo2)) !== false && $a !== nil) {
            docinfo_path = self.$normalize_system_path(docinfo_filename);
            content = self.$read_asset(docinfo_path);
            if (($a = content['$nil?']()) === false || $a === nil) {
              if (($a = $opalScope.FORCE_ENCODING) !== false && $a !== nil) {
                content.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_8)};
              content = self.$sub_attributes(content.$split($opalScope.LINE_SPLIT))['$*']($opalScope.EOL);};};
          if (($a = ($b = (((($c = docinfo) !== false && $c !== nil) ? $c : docinfo2)), $b !== false && $b !== nil ?self.attributes['$has_key?']("docname") : $b)) !== false && $a !== nil) {
            docinfo_path = self.$normalize_system_path("" + (self.attributes['$[]']("docname")) + "-" + (docinfo_filename));
            content2 = self.$read_asset(docinfo_path);
            if (($a = content2['$nil?']()) === false || $a === nil) {
              if (($a = $opalScope.FORCE_ENCODING) !== false && $a !== nil) {
                content2.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_8)};
              content2 = self.$sub_attributes(content2.$split($opalScope.LINE_SPLIT))['$*']($opalScope.EOL);
              content = (function() {if (($a = content['$nil?']()) !== false && $a !== nil) {
                return content2
                } else {
                return "" + (content) + ($opalScope.EOL) + (content2)
              }; return nil; })();};};
          return content.$to_s();
        };
      };

      return (def.$to_s = TMP_15 = function() {var $zuper = $slice.call(arguments, 0);
        var self = this, $iter = TMP_15._p, $yield = $iter || nil;
        TMP_15._p = null;
        return "" + ($opal.find_super_dispatcher(self, 'to_s', TMP_15, $iter).apply(self, $zuper).$to_s()) + " - " + (self.$doctitle());
      }, nil);
    })(self, $opalScope.AbstractBlock)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Inline(){};
      var self = $Inline = $klass($base, $super, 'Inline', $Inline);

      var def = $Inline._proto, $opalScope = $Inline._scope, TMP_1;
      def.template_name = nil;
      self.$attr_accessor("template_name");

      self.$attr_reader("text");

      self.$attr_reader("type");

      self.$attr_accessor("target");

      def.$initialize = TMP_1 = function(parent, context, text, opts) {
        var $a, $b, self = this, $iter = TMP_1._p, $yield = $iter || nil, attributes = nil;
        if (text == null) {
          text = nil
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, context]);
        self.template_name = "inline_" + (context);
        self.text = text;
        self.id = opts['$[]']("id");
        self.type = opts['$[]']("type");
        self.target = opts['$[]']("target");
        if (($a = ($b = opts['$has_key?']("attributes"), $b !== false && $b !== nil ?((attributes = opts['$[]']("attributes")))['$is_a?']($opalScope.Hash) : $b)) !== false && $a !== nil) {
          if (($a = attributes['$empty?']()) !== false && $a !== nil) {
            return nil
            } else {
            return self.$update_attributes(opts['$[]']("attributes"))
          }
          } else {
          return nil
        };
      };

      return (def.$render = function() {
        var self = this;
        return self.$renderer().$render(self.template_name, self).$chomp();
      }, nil);
    })(self, $opalScope.AbstractNode)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $range = $opal.range, $gvars = $opal.gvars;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Lexer(){};
      var self = $Lexer = $klass($base, $super, 'Lexer', $Lexer);

      var def = $Lexer._proto, $opalScope = $Lexer._scope;
      $opal.cdecl($opalScope, 'BlockMatchData', $opalScope.Struct.$new("context", "masq", "tip", "terminator"));

      def.$initialize = function() {
        var self = this;
        return self.$raise("Au contraire, mon frere. No lexer instances will be running around.");
      };

      $opal.defs(self, '$parse', function(reader, document, options) {
        var $a, $b, self = this, block_attributes = nil, new_section = nil;
        if (options == null) {
          options = $hash2([], {})
        }
        block_attributes = self.$parse_document_header(reader, document);
        if (($a = options['$[]']("header_only")) === false || $a === nil) {
          while (($b = reader['$has_more_lines?']()) !== false && $b !== nil) {
          $b = $opal.to_ary(self.$next_section(reader, document, block_attributes)), new_section = ($b[0] == null ? nil : $b[0]), block_attributes = ($b[1] == null ? nil : $b[1]);
          if (($b = new_section['$nil?']()) === false || $b === nil) {
            document['$<<'](new_section)};}};
        return document;
      });

      $opal.defs(self, '$parse_document_header', function(reader, document) {
        var $a, $b, $c, self = this, block_attributes = nil, assigned_doctitle = nil, val = nil, section_title = nil, _ = nil, doctitle = nil;
        block_attributes = self.$parse_block_metadata_lines(reader, document);
        if (($a = block_attributes['$has_key?']("title")) !== false && $a !== nil) {
          return document.$finalize_header(block_attributes, false)};
        assigned_doctitle = nil;
        if (($a = ((val = document.$attributes().$fetch("doctitle", "")))['$empty?']()) === false || $a === nil) {
          document['$title='](val);
          assigned_doctitle = val;};
        section_title = nil;
        if (($a = self['$is_next_line_document_title?'](reader, block_attributes)) !== false && $a !== nil) {
          $a = $opal.to_ary(self.$parse_section_title(reader, document)), document['$id='](($a[0] == null ? nil : $a[0])), _ = ($a[1] == null ? nil : $a[1]), doctitle = ($a[2] == null ? nil : $a[2]), _ = ($a[3] == null ? nil : $a[3]), _ = ($a[4] == null ? nil : $a[4]);
          if (($a = assigned_doctitle) === false || $a === nil) {
            document['$title='](doctitle);
            assigned_doctitle = doctitle;};
          document.$attributes()['$[]=']("doctitle", section_title = doctitle);
          if (($a = ($b = document.$id()['$nil?'](), $b !== false && $b !== nil ?block_attributes['$has_key?']("id") : $b)) !== false && $a !== nil) {
            document['$id='](block_attributes.$delete("id"))};
          self.$parse_header_metadata(reader, document);};
        if (($a = ($b = ($c = ((val = document.$attributes().$fetch("doctitle", "")))['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = val['$=='](section_title), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          document['$title='](val);
          assigned_doctitle = val;};
        if (assigned_doctitle !== false && assigned_doctitle !== nil) {
          document.$attributes()['$[]=']("doctitle", assigned_doctitle)};
        if (document.$doctype()['$==']("manpage")) {
          self.$parse_manpage_header(reader, document)};
        return document.$finalize_header(block_attributes);
      });

      $opal.defs(self, '$parse_manpage_header', function(reader, document) {
        var $a, self = this, m = nil, name_section = nil, name_section_buffer = nil;
        if (($a = (m = document.$attributes()['$[]']("doctitle").$match($opalScope.REGEXP['$[]']("mantitle_manvolnum")))) !== false && $a !== nil) {
          document.$attributes()['$[]=']("mantitle", document.$sub_attributes(m['$[]'](1).$rstrip().$downcase()));
          document.$attributes()['$[]=']("manvolnum", m['$[]'](2).$strip());
          } else {
          self.$warn("asciidoctor: ERROR: " + (reader.$prev_line_info()) + ": malformed manpage title")
        };
        reader.$skip_blank_lines();
        if (($a = self['$is_next_line_section?'](reader, $hash2([], {}))) !== false && $a !== nil) {
          name_section = self.$initialize_section(reader, document, $hash2([], {}));
          if (name_section.$level()['$=='](1)) {
            name_section_buffer = reader.$read_lines_until($hash2(["break_on_blank_lines"], {"break_on_blank_lines": true})).$join(" ").$tr_s(" ", " ");
            if (($a = (m = name_section_buffer.$match($opalScope.REGEXP['$[]']("manname_manpurpose")))) !== false && $a !== nil) {
              document.$attributes()['$[]=']("manname", m['$[]'](1));
              document.$attributes()['$[]=']("manpurpose", m['$[]'](2));
              if (document.$backend()['$==']("manpage")) {
                document.$attributes()['$[]=']("docname", document.$attributes()['$[]']("manname"));
                return document.$attributes()['$[]=']("outfilesuffix", "." + (document.$attributes()['$[]']("manvolnum")));
                } else {
                return nil
              };
              } else {
              return self.$warn("asciidoctor: ERROR: " + (reader.$prev_line_info()) + ": malformed name section body")
            };
            } else {
            return self.$warn("asciidoctor: ERROR: " + (reader.$prev_line_info()) + ": name section title must be at level 1")
          };
          } else {
          return self.$warn("asciidoctor: ERROR: " + (reader.$prev_line_info()) + ": name section expected")
        };
      });

      $opal.defs(self, '$next_section', function(reader, parent, attributes) {
        var $a, $b, $c, $d, TMP_1, $e, self = this, preamble = nil, part = nil, intro = nil, doctype = nil, section = nil, current_level = nil, expected_next_levels = nil, next_level = nil, new_section = nil, block_line_info = nil, new_block = nil, first_block = nil, document = nil, child_block = nil;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        preamble = false;
        part = false;
        intro = false;
        if (($a = ($b = (($c = parent.$context()['$==']("document")) ? parent.$blocks()['$empty?']() : $c), $b !== false && $b !== nil ?(((($c = ((($d = parent['$has_header?']()) !== false && $d !== nil) ? $d : attributes.$delete("invalid-header"))) !== false && $c !== nil) ? $c : ($d = self['$is_next_line_section?'](reader, attributes), ($d === nil || $d === false)))) : $b)) !== false && $a !== nil) {
          doctype = parent.$doctype();
          if (($a = parent['$has_header?']()) !== false && $a !== nil) {
            preamble = intro = $opalScope.Block.$new(parent, "preamble", $hash2(["content_model"], {"content_model": "compound"}));
            parent['$<<'](preamble);};
          section = parent;
          current_level = 0;
          if (($a = parent.$attributes()['$has_key?']("fragment")) !== false && $a !== nil) {
            expected_next_levels = nil
          } else if (doctype['$==']("book")) {
            expected_next_levels = [0, 1]
            } else {
            expected_next_levels = [1]
          };
          } else {
          doctype = parent.$document().$doctype();
          section = self.$initialize_section(reader, parent, attributes);
          attributes = ($a = ($b = attributes).$delete_if, $a._p = (TMP_1 = function(k, v){var self = TMP_1._s || this, $a;if (k == null) k = nil;if (v == null) v = nil;
          return ($a = k['$==']("title"), ($a === nil || $a === false))}, TMP_1._s = self, TMP_1), $a).call($b);
          current_level = section.$level();
          if (($a = (($c = current_level['$=='](0)) ? doctype['$==']("book") : $c)) !== false && $a !== nil) {
            part = ($a = section.$special(), ($a === nil || $a === false));
            if (($a = ($c = section.$special(), $c !== false && $c !== nil ?(["preface", "appendix"]['$include?'](section.$sectname())) : $c)) !== false && $a !== nil) {
              expected_next_levels = [current_level['$+'](2)]
              } else {
              expected_next_levels = [current_level['$+'](1)]
            };
            } else {
            expected_next_levels = [current_level['$+'](1)]
          };
        };
        reader.$skip_blank_lines();
        while (($c = reader['$has_more_lines?']()) !== false && $c !== nil) {
        self.$parse_block_metadata_lines(reader, section, attributes);
        next_level = self['$is_next_line_section?'](reader, attributes);
        if (next_level !== false && next_level !== nil) {
          next_level = next_level['$+'](section.$document().$attr("leveloffset", 0).$to_i());
          if (($c = ((($d = next_level['$>'](current_level)) !== false && $d !== nil) ? $d : ((($e = section.$context()['$==']("document")) ? next_level['$=='](0) : $e)))) !== false && $c !== nil) {
            if (($c = (($d = next_level['$=='](0)) ? ($e = doctype['$==']("book"), ($e === nil || $e === false)) : $d)) !== false && $c !== nil) {
              self.$warn("asciidoctor: ERROR: " + (reader.$line_info()) + ": only book doctypes can contain level 0 sections")
            } else if (($c = ($d = ($e = expected_next_levels['$nil?'](), ($e === nil || $e === false)), $d !== false && $d !== nil ?($e = expected_next_levels['$include?'](next_level), ($e === nil || $e === false)) : $d)) !== false && $c !== nil) {
              self.$warn(((("asciidoctor: WARNING: ") + (reader.$line_info())) + ": section title out of sequence: ")['$+']("expected " + ((function() {if (expected_next_levels.$size()['$>'](1)) {
                return "levels"
                } else {
                return "level"
              }; return nil; })()) + " " + (expected_next_levels['$*'](" or ")) + ", ")['$+']("got level " + (next_level)))};
            $c = $opal.to_ary(self.$next_section(reader, section, attributes)), new_section = ($c[0] == null ? nil : $c[0]), attributes = ($c[1] == null ? nil : $c[1]);
            section['$<<'](new_section);
            } else {
            if (($c = (($d = next_level['$=='](0)) ? ($e = doctype['$==']("book"), ($e === nil || $e === false)) : $d)) !== false && $c !== nil) {
              self.$warn("asciidoctor: ERROR: " + (reader.$line_info()) + ": only book doctypes can contain level 0 sections")};
            break;;
          };
          } else {
          block_line_info = reader.$line_info();
          new_block = self.$next_block(reader, (((($c = intro) !== false && $c !== nil) ? $c : section)), attributes, $hash2(["parse_metadata"], {"parse_metadata": false}));
          if (($c = ($d = new_block['$nil?'](), ($d === nil || $d === false))) !== false && $c !== nil) {
            if (part !== false && part !== nil) {
              if (($c = ($d = section['$blocks?'](), ($d === nil || $d === false))) !== false && $c !== nil) {
                if (($c = ($d = new_block.$style()['$==']("partintro"), ($d === nil || $d === false))) !== false && $c !== nil) {
                  if (new_block.$context()['$==']("paragraph")) {
                    new_block['$context=']("open");
                    new_block['$style=']("partintro");
                    } else {
                    intro = $opalScope.Block.$new(section, "open", $hash2(["content_model"], {"content_model": "compound"}));
                    intro['$style=']("partintro");
                    new_block['$parent='](intro);
                    section['$<<'](intro);
                  }}
              } else if (section.$blocks().$size()['$=='](1)) {
                first_block = section.$blocks().$first();
                if (($c = ($d = ($e = intro, ($e === nil || $e === false)), $d !== false && $d !== nil ?first_block.$content_model()['$==']("compound") : $d)) !== false && $c !== nil) {
                  self.$warn("asciidoctor: ERROR: " + (block_line_info) + ": illegal block content outside of partintro block")
                } else if (($c = ($d = first_block.$content_model()['$==']("compound"), ($d === nil || $d === false))) !== false && $c !== nil) {
                  intro = $opalScope.Block.$new(section, "open", $hash2(["content_model"], {"content_model": "compound"}));
                  intro['$style=']("partintro");
                  section.$blocks().$shift();
                  if (first_block.$style()['$==']("partintro")) {
                    first_block['$context=']("paragraph");
                    first_block['$style='](nil);};
                  first_block['$parent='](intro);
                  intro['$<<'](first_block);
                  new_block['$parent='](intro);
                  section['$<<'](intro);};}};
            (((($c = intro) !== false && $c !== nil) ? $c : section))['$<<'](new_block);
            attributes = $hash2([], {});};
        };
        reader.$skip_blank_lines();};
        if (part !== false && part !== nil) {
          if (($a = ($c = section['$blocks?'](), $c !== false && $c !== nil ?section.$blocks().$last().$context()['$==']("section") : $c)) === false || $a === nil) {
            self.$warn("asciidoctor: ERROR: " + (reader.$line_info()) + ": invalid part, must have at least one section (e.g., chapter, appendix, etc.)")}
        } else if (preamble !== false && preamble !== nil) {
          document = parent;
          if (($a = preamble['$blocks?']()) !== false && $a !== nil) {
            if (($a = ($c = ($d = $opalScope.Compliance.$unwrap_standalone_preamble(), $d !== false && $d !== nil ?document.$blocks().$size()['$=='](1) : $d), $c !== false && $c !== nil ?(((($d = ($e = doctype['$==']("book"), ($e === nil || $e === false))) !== false && $d !== nil) ? $d : ($e = preamble.$blocks().$first().$style()['$==']("abstract"), ($e === nil || $e === false)))) : $c)) !== false && $a !== nil) {
              document.$blocks().$shift();
              while (($c = (child_block = preamble.$blocks().$shift())) !== false && $c !== nil) {
              child_block['$parent='](document);
              document['$<<'](child_block);};}
            } else {
            document.$blocks().$shift()
          };};
        return [(function() {if (($a = ($c = section['$=='](parent), ($c === nil || $c === false))) !== false && $a !== nil) {
          return section
          } else {
          return nil
        }; return nil; })(), attributes.$dup()];
      });

      $opal.defs(self, '$next_block', function(reader, parent, attributes, options) {
        var $a, $b, $c, $d, $e, $f, TMP_2, TMP_3, $g, TMP_4, TMP_5, $h, $i, $j, TMP_6, $k, $l, $m, TMP_7, TMP_8, self = this, skipped = nil, text_only = nil, parse_metadata = nil, document = nil, extensions = nil, block_extensions = nil, macro_extensions = nil, in_list = nil, block = nil, style = nil, explicit_style = nil, this_line = nil, delimited_block = nil, block_context = nil, cloaked_context = nil, terminator = nil, delimited_blk_match = nil, first_char = nil, match = nil, blk_ctx = nil, posattrs = nil, target = nil, name = nil, raw_attributes = nil, processor = nil, default_attrs = nil, expected_index = nil, list_item = nil, coids = nil, marker = nil, float_id = nil, float_reftext = nil, float_title = nil, float_level = nil, _ = nil, tmp_sect = nil, break_at_list = nil, lines = nil, first_line = nil, admonition_match = nil, admonition_name = nil, attribution = nil, citetitle = nil, first_line_shifted = nil, indent = nil, $case = nil, language = nil, linenums = nil, default_math_syntax = nil, cursor = nil, block_reader = nil, content_model = nil, pos_attrs = nil;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        if (options == null) {
          options = $hash2([], {})
        }
        skipped = reader.$skip_blank_lines();
        if (($a = reader['$has_more_lines?']()) === false || $a === nil) {
          return nil};
        text_only = options['$[]']("text");
        if (($a = (($b = text_only !== false && text_only !== nil) ? skipped['$>'](0) : $b)) !== false && $a !== nil) {
          options.$delete("text");
          text_only = false;};
        parse_metadata = options.$fetch("parse_metadata", true);
        document = parent.$document();
        if (($a = (extensions = document.$extensions())) !== false && $a !== nil) {
          block_extensions = extensions['$blocks?']();
          macro_extensions = extensions['$block_macros?']();
          } else {
          block_extensions = macro_extensions = false
        };
        in_list = (parent['$is_a?']($opalScope.List));
        block = nil;
        style = nil;
        explicit_style = nil;
        while (($b = ($c = reader['$has_more_lines?'](), $c !== false && $c !== nil ?block['$nil?']() : $c)) !== false && $b !== nil) {
        if (($b = (($c = parse_metadata !== false && parse_metadata !== nil) ? self.$parse_block_metadata_line(reader, document, attributes, options) : $c)) !== false && $b !== nil) {
          reader.$advance();
          continue;;};
        this_line = reader.$read_line();
        delimited_block = false;
        block_context = nil;
        cloaked_context = nil;
        terminator = nil;
        if (($b = attributes['$[]'](1)) !== false && $b !== nil) {
          $b = $opal.to_ary(self.$parse_style_attribute(attributes, reader)), style = ($b[0] == null ? nil : $b[0]), explicit_style = ($b[1] == null ? nil : $b[1])};
        if (($b = delimited_blk_match = self['$is_delimited_block?'](this_line, true)) !== false && $b !== nil) {
          delimited_block = true;
          block_context = cloaked_context = delimited_blk_match.$context();
          terminator = delimited_blk_match.$terminator();
          if (($b = ($c = style, ($c === nil || $c === false))) !== false && $b !== nil) {
            style = attributes['$[]=']("style", block_context.$to_s())
          } else if (($b = ($c = style['$=='](block_context.$to_s()), ($c === nil || $c === false))) !== false && $b !== nil) {
            if (($b = delimited_blk_match.$masq()['$include?'](style)) !== false && $b !== nil) {
              block_context = style.$to_sym()
            } else if (($b = ($c = delimited_blk_match.$masq()['$include?']("admonition"), $c !== false && $c !== nil ?$opalScope.ADMONITION_STYLES['$include?'](style) : $c)) !== false && $b !== nil) {
              block_context = "admonition"
            } else if (($b = (($c = block_extensions !== false && block_extensions !== nil) ? extensions['$processor_registered_for_block?'](style, block_context) : $c)) !== false && $b !== nil) {
              block_context = style.$to_sym()
              } else {
              self.$warn("asciidoctor: WARNING: " + (reader.$prev_line_info()) + ": invalid style for " + (block_context) + " block: " + (style));
              style = block_context.$to_s();
            }};};
        if (($b = ($c = delimited_block, ($c === nil || $c === false))) !== false && $b !== nil) {
          while (($c = true) !== false && $c !== nil) {
          if (($c = ($d = ($e = ($f = style['$nil?'](), ($f === nil || $f === false)), $e !== false && $e !== nil ?$opalScope.Compliance.$strict_verbatim_paragraphs() : $e), $d !== false && $d !== nil ?$opalScope.VERBATIM_STYLES['$include?'](style) : $d)) !== false && $c !== nil) {
            block_context = style.$to_sym();
            reader.$unshift_line(this_line);
            break;;};
          if (($c = text_only) === false || $c === nil) {
            first_char = (function() {if (($c = $opalScope.Compliance.$markdown_syntax()) !== false && $c !== nil) {
              return this_line.$lstrip()['$[]']($range(0, 0, false))
              } else {
              return this_line['$[]']($range(0, 0, false))
            }; return nil; })();
            if (($c = ($d = ($e = ($opalScope.BREAK_LINES['$has_key?'](first_char)), $e !== false && $e !== nil ?this_line.$length()['$>='](3) : $e), $d !== false && $d !== nil ?(match = this_line.$match((function() {if (($e = $opalScope.Compliance.$markdown_syntax()) !== false && $e !== nil) {
              return $opalScope.REGEXP['$[]']("break_line_plus")
              } else {
              return $opalScope.REGEXP['$[]']("break_line")
            }; return nil; })())) : $d)) !== false && $c !== nil) {
              block = $opalScope.Block.$new(parent, $opalScope.BREAK_LINES['$[]'](first_char), $hash2(["content_model"], {"content_model": "empty"}));
              break;;
            } else if (($c = (match = this_line.$match($opalScope.REGEXP['$[]']("media_blk_macro")))) !== false && $c !== nil) {
              blk_ctx = match['$[]'](1).$to_sym();
              block = $opalScope.Block.$new(parent, blk_ctx, $hash2(["content_model"], {"content_model": "empty"}));
              if (blk_ctx['$==']("image")) {
                posattrs = ["alt", "width", "height"]
              } else if (blk_ctx['$==']("video")) {
                posattrs = ["poster", "width", "height"]
                } else {
                posattrs = []
              };
              if (($c = ((($d = style['$nil?']()) !== false && $d !== nil) ? $d : explicit_style)) === false || $c === nil) {
                if (blk_ctx['$==']("image")) {
                  attributes['$[]=']("alt", style)};
                attributes.$delete("style");
                style = nil;};
              block.$parse_attributes(match['$[]'](3), posattrs, $hash2(["unescape_input", "sub_input", "sub_result", "into"], {"unescape_input": (blk_ctx['$==']("image")), "sub_input": true, "sub_result": false, "into": attributes}));
              target = block.$sub_attributes(match['$[]'](2), $hash2(["attribute_missing"], {"attribute_missing": "drop-line"}));
              if (($c = target['$empty?']()) !== false && $c !== nil) {
                if (document.$attributes().$fetch("attribute-missing", $opalScope.Compliance.$attribute_missing())['$==']("skip")) {
                  return $opalScope.Block.$new(parent, "paragraph", $hash2(["source"], {"source": [this_line]}))
                  } else {
                  return nil
                }};
              attributes['$[]=']("target", target);
              if (($c = attributes['$has_key?']("title")) !== false && $c !== nil) {
                block['$title='](attributes.$delete("title"))};
              if (blk_ctx['$==']("image")) {
                if (($c = attributes['$has_key?']("scaledwidth")) !== false && $c !== nil) {
                  if (($c = ($range(48, 57, false))['$include?']((((($d = attributes['$[]']("scaledwidth")['$[]'](-1)) !== false && $d !== nil) ? $d : 0)).$ord())) !== false && $c !== nil) {
                    attributes['$[]=']("scaledwidth", "" + (attributes['$[]']("scaledwidth")) + "%")}};
                document.$register("images", target);
                ($c = "alt", $d = attributes, ((($e = $d['$[]']($c)) !== false && $e !== nil) ? $e : $d['$[]=']($c, $opalScope.File.$basename(target, $opalScope.File.$extname(target)).$tr("_-", " "))));
                block.$assign_caption(attributes.$delete("caption"), "figure");};
              break;;
            } else if (($c = (($d = first_char['$==']("t")) ? (match = this_line.$match($opalScope.REGEXP['$[]']("toc"))) : $d)) !== false && $c !== nil) {
              block = $opalScope.Block.$new(parent, "toc", $hash2(["content_model"], {"content_model": "empty"}));
              block.$parse_attributes(match['$[]'](1), [], $hash2(["sub_result", "into"], {"sub_result": false, "into": attributes}));
              break;;
            } else if (($c = ($d = (($e = macro_extensions !== false && macro_extensions !== nil) ? (match = this_line.$match($opalScope.REGEXP['$[]']("generic_blk_macro"))) : $e), $d !== false && $d !== nil ?extensions['$processor_registered_for_block_macro?'](match['$[]'](1)) : $d)) !== false && $c !== nil) {
              name = match['$[]'](1);
              target = match['$[]'](2);
              raw_attributes = match['$[]'](3);
              processor = extensions.$load_block_macro_processor(name, document);
              if (($c = raw_attributes['$empty?']()) === false || $c === nil) {
                document.$parse_attributes(raw_attributes, processor.$options().$fetch("pos_attrs", []), $hash2(["sub_input", "sub_result", "into"], {"sub_input": true, "sub_result": false, "into": attributes}))};
              if (($c = ($d = ((default_attrs = processor.$options().$fetch("default_attrs", $hash2([], {}))))['$empty?'](), ($d === nil || $d === false))) !== false && $c !== nil) {
                ($c = ($d = default_attrs).$each, $c._p = (TMP_2 = function(k, v){var self = TMP_2._s || this, $a, $b, $c;if (k == null) k = nil;if (v == null) v = nil;
                return ($a = k, $b = attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, v)))}, TMP_2._s = self, TMP_2), $c).call($d)};
              block = processor.$process(parent, target, attributes);
              if (($c = block['$nil?']()) !== false && $c !== nil) {
                return nil};
              break;;};};
          if (($c = (match = this_line.$match($opalScope.REGEXP['$[]']("colist")))) !== false && $c !== nil) {
            block = $opalScope.List.$new(parent, "colist");
            attributes['$[]=']("style", "arabic");
            reader.$unshift_line(this_line);
            expected_index = 1;
            while (($e = ($f = reader['$has_more_lines?'](), $f !== false && $f !== nil ?match = reader.$peek_line().$match($opalScope.REGEXP['$[]']("colist")) : $f)) !== false && $e !== nil) {
            if (($e = ($f = match['$[]'](1).$to_i()['$=='](expected_index), ($f === nil || $f === false))) !== false && $e !== nil) {
              self.$warn("asciidoctor: WARNING: " + (reader.$path()) + ": line " + (reader.$lineno()['$-'](2)) + ": callout list item index: expected " + (expected_index) + " got " + (match['$[]'](1)))};
            list_item = self.$next_list_item(reader, block, match);
            expected_index = expected_index['$+'](1);
            if (($e = ($f = list_item['$nil?'](), ($f === nil || $f === false))) !== false && $e !== nil) {
              block['$<<'](list_item);
              coids = document.$callouts().$callout_ids(block.$items().$size());
              if (($e = ($f = coids['$empty?'](), ($f === nil || $f === false))) !== false && $e !== nil) {
                list_item.$attributes()['$[]=']("coids", coids)
                } else {
                self.$warn("asciidoctor: WARNING: " + (reader.$path()) + ": line " + (reader.$lineno()['$-'](2)) + ": no callouts refer to list item " + (block.$items().$size()))
              };};};
            document.$callouts().$next_list();
            break;;
          } else if (($c = (match = this_line.$match($opalScope.REGEXP['$[]']("ulist")))) !== false && $c !== nil) {
            reader.$unshift_line(this_line);
            block = self.$next_outline_list(reader, "ulist", parent);
            break;;
          } else if (($c = (match = this_line.$match($opalScope.REGEXP['$[]']("olist")))) !== false && $c !== nil) {
            reader.$unshift_line(this_line);
            block = self.$next_outline_list(reader, "olist", parent);
            if (($c = ($e = ($f = attributes['$[]']("style"), ($f === nil || $f === false)), $e !== false && $e !== nil ?($f = block.$attributes()['$[]']("style"), ($f === nil || $f === false)) : $e)) !== false && $c !== nil) {
              marker = block.$items().$first().$marker();
              if (($c = marker['$start_with?'](".")) !== false && $c !== nil) {
                attributes['$[]=']("style", (((($c = $opalScope.ORDERED_LIST_STYLES['$[]'](marker.$length()['$-'](1))) !== false && $c !== nil) ? $c : $opalScope.ORDERED_LIST_STYLES.$first())).$to_s())
                } else {
                style = ($c = ($e = $opalScope.ORDERED_LIST_STYLES).$detect, $c._p = (TMP_3 = function(s){var self = TMP_3._s || this;if (s == null) s = nil;
                return marker.$match($opalScope.ORDERED_LIST_MARKER_PATTERNS['$[]'](s))}, TMP_3._s = self, TMP_3), $c).call($e);
                attributes['$[]=']("style", (((($c = style) !== false && $c !== nil) ? $c : $opalScope.ORDERED_LIST_STYLES.$first())).$to_s());
              };};
            break;;
          } else if (($c = (match = this_line.$match($opalScope.REGEXP['$[]']("dlist")))) !== false && $c !== nil) {
            reader.$unshift_line(this_line);
            block = self.$next_labeled_list(reader, match, parent);
            break;;
          } else if (($c = ($f = (((($g = style['$==']("float")) !== false && $g !== nil) ? $g : style['$==']("discrete"))), $f !== false && $f !== nil ?self['$is_section_title?'](this_line, ((function() {if (($g = $opalScope.Compliance.$underline_style_section_titles()) !== false && $g !== nil) {
            return reader.$peek_line(true)
            } else {
            return nil
          }; return nil; })())) : $f)) !== false && $c !== nil) {
            reader.$unshift_line(this_line);
            $c = $opal.to_ary(self.$parse_section_title(reader, document)), float_id = ($c[0] == null ? nil : $c[0]), float_reftext = ($c[1] == null ? nil : $c[1]), float_title = ($c[2] == null ? nil : $c[2]), float_level = ($c[3] == null ? nil : $c[3]), _ = ($c[4] == null ? nil : $c[4]);
            if (float_reftext !== false && float_reftext !== nil) {
              attributes['$[]=']("reftext", float_reftext)};
            if (($c = attributes['$has_key?']("id")) !== false && $c !== nil) {
              ((($c = float_id) !== false && $c !== nil) ? $c : float_id = attributes['$[]']("id"))};
            block = $opalScope.Block.$new(parent, "floating_title", $hash2(["content_model"], {"content_model": "empty"}));
            if (($c = ((($f = float_id['$nil?']()) !== false && $f !== nil) ? $f : float_id['$empty?']())) !== false && $c !== nil) {
              tmp_sect = $opalScope.Section.$new(parent);
              tmp_sect['$title='](float_title);
              block['$id='](tmp_sect.$generate_id());
              } else {
              block['$id='](float_id)
            };
            block['$level='](float_level);
            block['$title='](float_title);
            break;;
          } else if (($c = ($f = ($g = style['$nil?'](), ($g === nil || $g === false)), $f !== false && $f !== nil ?($g = style['$==']("normal"), ($g === nil || $g === false)) : $f)) !== false && $c !== nil) {
            if (($c = $opalScope.PARAGRAPH_STYLES['$include?'](style)) !== false && $c !== nil) {
              block_context = style.$to_sym();
              cloaked_context = "paragraph";
              reader.$unshift_line(this_line);
              break;;
            } else if (($c = $opalScope.ADMONITION_STYLES['$include?'](style)) !== false && $c !== nil) {
              block_context = "admonition";
              cloaked_context = "paragraph";
              reader.$unshift_line(this_line);
              break;;
            } else if (($c = (($f = block_extensions !== false && block_extensions !== nil) ? extensions['$processor_registered_for_block?'](style, "paragraph") : $f)) !== false && $c !== nil) {
              block_context = style.$to_sym();
              cloaked_context = "paragraph";
              reader.$unshift_line(this_line);
              break;;
              } else {
              self.$warn("asciidoctor: WARNING: " + (reader.$prev_line_info()) + ": invalid style for paragraph: " + (style));
              style = nil;
            }};
          break_at_list = ((($c = skipped['$=='](0)) ? in_list : $c));
          if (($c = ($f = ($g = style['$==']("normal"), ($g === nil || $g === false)), $f !== false && $f !== nil ?this_line.$match($opalScope.REGEXP['$[]']("lit_par")) : $f)) !== false && $c !== nil) {
            reader.$unshift_line(this_line);
            lines = ($c = ($f = reader).$read_lines_until, $c._p = (TMP_4 = function(line){var self = TMP_4._s || this, $a, $b, $c;if (line == null) line = nil;
            return ((($a = ((($b = break_at_list !== false && break_at_list !== nil) ? line.$match($opalScope.REGEXP['$[]']("any_list")) : $b))) !== false && $a !== nil) ? $a : (($b = $opalScope.Compliance.$block_terminates_paragraph(), $b !== false && $b !== nil ?(((($c = self['$is_delimited_block?'](line)) !== false && $c !== nil) ? $c : line.$match($opalScope.REGEXP['$[]']("attr_line")))) : $b)))}, TMP_4._s = self, TMP_4), $c).call($f, $hash2(["break_on_blank_lines", "break_on_list_continuation", "preserve_last_line"], {"break_on_blank_lines": true, "break_on_list_continuation": true, "preserve_last_line": true}));
            self['$reset_block_indent!'](lines);
            block = $opalScope.Block.$new(parent, "literal", $hash2(["content_model", "source", "attributes"], {"content_model": "verbatim", "source": lines, "attributes": attributes}));
            if (in_list !== false && in_list !== nil) {
              block.$set_option("listparagraph")};
            } else {
            reader.$unshift_line(this_line);
            lines = ($c = ($g = reader).$read_lines_until, $c._p = (TMP_5 = function(line){var self = TMP_5._s || this, $a, $b, $c;if (line == null) line = nil;
            return ((($a = ((($b = break_at_list !== false && break_at_list !== nil) ? line.$match($opalScope.REGEXP['$[]']("any_list")) : $b))) !== false && $a !== nil) ? $a : (($b = $opalScope.Compliance.$block_terminates_paragraph(), $b !== false && $b !== nil ?(((($c = self['$is_delimited_block?'](line)) !== false && $c !== nil) ? $c : line.$match($opalScope.REGEXP['$[]']("attr_line")))) : $b)))}, TMP_5._s = self, TMP_5), $c).call($g, $hash2(["break_on_blank_lines", "break_on_list_continuation", "preserve_last_line", "skip_line_comments"], {"break_on_blank_lines": true, "break_on_list_continuation": true, "preserve_last_line": true, "skip_line_comments": true}));
            if (($c = lines['$empty?']()) !== false && $c !== nil) {
              reader.$advance();
              return nil;};
            self.$catalog_inline_anchors(lines.$join($opalScope.EOL), document);
            first_line = lines.$first();
            if (($c = ($h = ($i = text_only, ($i === nil || $i === false)), $h !== false && $h !== nil ?(admonition_match = first_line.$match($opalScope.REGEXP['$[]']("admonition_inline"))) : $h)) !== false && $c !== nil) {
              lines['$[]='](0, admonition_match.$post_match().$lstrip());
              attributes['$[]=']("style", admonition_match['$[]'](1));
              attributes['$[]=']("name", admonition_name = admonition_match['$[]'](1).$downcase());
              ($c = "caption", $h = attributes, ((($i = $h['$[]']($c)) !== false && $i !== nil) ? $i : $h['$[]=']($c, document.$attributes()['$[]']("" + (admonition_name) + "-caption"))));
              block = $opalScope.Block.$new(parent, "admonition", $hash2(["source", "attributes"], {"source": lines, "attributes": attributes}));
            } else if (($c = ($h = ($i = ($j = text_only, ($j === nil || $j === false)), $i !== false && $i !== nil ?$opalScope.Compliance.$markdown_syntax() : $i), $h !== false && $h !== nil ?first_line['$start_with?']("> ") : $h)) !== false && $c !== nil) {
              ($c = ($h = lines)['$map!'], $c._p = (TMP_6 = function(line){var self = TMP_6._s || this, $a;if (line == null) line = nil;
              if (line['$=='](">")) {
                  return line['$[]']($range(1, -1, false))
                } else if (($a = line['$start_with?']("> ")) !== false && $a !== nil) {
                  return line['$[]']($range(2, -1, false))
                  } else {
                  return line
                }}, TMP_6._s = self, TMP_6), $c).call($h);
              if (($c = lines.$last()['$start_with?']("-- ")) !== false && $c !== nil) {
                $c = $opal.to_ary(lines.$pop()['$[]']($range(3, -1, false)).$split(", ", 2)), attribution = ($c[0] == null ? nil : $c[0]), citetitle = ($c[1] == null ? nil : $c[1]);
                while (($i = lines.$last()['$empty?']()) !== false && $i !== nil) {
                lines.$pop()};
                } else {
                $c = $opal.to_ary(nil), attribution = ($c[0] == null ? nil : $c[0]), citetitle = ($c[1] == null ? nil : $c[1])
              };
              attributes['$[]=']("style", "quote");
              if (($c = attribution['$nil?']()) === false || $c === nil) {
                attributes['$[]=']("attribution", attribution)};
              if (($c = citetitle['$nil?']()) === false || $c === nil) {
                attributes['$[]=']("citetitle", citetitle)};
              block = self.$build_block("quote", "compound", false, parent, $opalScope.Reader.$new(lines), attributes);
            } else if (($c = ($i = ($j = ($k = ($l = ($m = text_only, ($m === nil || $m === false)), $l !== false && $l !== nil ?lines.$size()['$>'](1) : $l), $k !== false && $k !== nil ?first_line['$start_with?']("\"") : $k), $j !== false && $j !== nil ?lines.$last()['$start_with?']("-- ") : $j), $i !== false && $i !== nil ?lines['$[]'](-2)['$end_with?']("\"") : $i)) !== false && $c !== nil) {
              lines['$[]='](0, first_line['$[]']($range(1, -1, false)));
              $c = $opal.to_ary(lines.$pop()['$[]']($range(3, -1, false)).$split(", ", 2)), attribution = ($c[0] == null ? nil : $c[0]), citetitle = ($c[1] == null ? nil : $c[1]);
              while (($i = lines.$last()['$empty?']()) !== false && $i !== nil) {
              lines.$pop()};
              lines['$[]='](-1, lines.$last().$chop());
              attributes['$[]=']("style", "quote");
              if (($c = attribution['$nil?']()) === false || $c === nil) {
                attributes['$[]=']("attribution", attribution)};
              if (($c = citetitle['$nil?']()) === false || $c === nil) {
                attributes['$[]=']("citetitle", citetitle)};
              block = $opalScope.Block.$new(parent, "quote", $hash2(["source", "attributes"], {"source": lines, "attributes": attributes}));
              } else {
              if (($c = (($i = style['$==']("normal")) ? (((($j = ((first_char = lines.$first()['$[]']($range(0, 0, false))))['$=='](" ")) !== false && $j !== nil) ? $j : first_char['$==']("\t"))) : $i)) !== false && $c !== nil) {
                first_line = lines.$first();
                first_line_shifted = first_line.$lstrip();
                indent = self.$line_length(first_line)['$-'](self.$line_length(first_line_shifted));
                lines['$[]='](0, first_line_shifted);
                ($c = ($i = lines.$size()).$times, $c._p = (TMP_7 = function(i){var self = TMP_7._s || this;if (i == null) i = nil;
                if (i['$>'](0)) {
                    return lines['$[]='](i, lines['$[]'](i)['$[]']($range(indent, -1, false)))
                    } else {
                    return nil
                  }}, TMP_7._s = self, TMP_7), $c).call($i);};
              block = $opalScope.Block.$new(parent, "paragraph", $hash2(["source", "attributes"], {"source": lines, "attributes": attributes}));
            };
          };
          break;;}};
        if (($b = ($c = block['$nil?'](), $c !== false && $c !== nil ?($j = block_context['$nil?'](), ($j === nil || $j === false)) : $c)) !== false && $b !== nil) {
          if (($b = ((($c = block_context['$==']("abstract")) !== false && $c !== nil) ? $c : block_context['$==']("partintro"))) !== false && $b !== nil) {
            block_context = "open"};
          $case = block_context;if ("admonition"['$===']($case)) {attributes['$[]=']("name", admonition_name = style.$downcase());
          ($b = "caption", $c = attributes, ((($j = $c['$[]']($b)) !== false && $j !== nil) ? $j : $c['$[]=']($b, document.$attributes()['$[]']("" + (admonition_name) + "-caption"))));
          block = self.$build_block(block_context, "compound", terminator, parent, reader, attributes);}else if ("comment"['$===']($case)) {self.$build_block(block_context, "skip", terminator, parent, reader, attributes);
          return nil;}else if ("example"['$===']($case)) {block = self.$build_block(block_context, "compound", terminator, parent, reader, attributes, $hash2(["supports_caption"], {"supports_caption": true}))}else if ("listing"['$===']($case) || "fenced_code"['$===']($case) || "source"['$===']($case)) {if (block_context['$==']("fenced_code")) {
            style = attributes['$[]=']("style", "source");
            $b = $opal.to_ary(this_line['$[]']($range(3, -1, false)).$split(",", 2)), language = ($b[0] == null ? nil : $b[0]), linenums = ($b[1] == null ? nil : $b[1]);
            if (($b = (($c = language !== false && language !== nil) ? ($j = ((language = language.$strip()))['$empty?'](), ($j === nil || $j === false)) : $c)) !== false && $b !== nil) {
              attributes['$[]=']("language", language);
              if (($b = (($c = linenums !== false && linenums !== nil) ? ($j = linenums.$strip()['$empty?'](), ($j === nil || $j === false)) : $c)) !== false && $b !== nil) {
                attributes['$[]=']("linenums", "")};};
            terminator = terminator['$[]']($range(0, 2, false));
          } else if (block_context['$==']("source")) {
            $opalScope.AttributeList.$rekey(attributes, [nil, "language", "linenums"])};
          block = self.$build_block("listing", "verbatim", terminator, parent, reader, attributes, $hash2(["supports_caption"], {"supports_caption": true}));}else if ("literal"['$===']($case)) {block = self.$build_block(block_context, "verbatim", terminator, parent, reader, attributes)}else if ("pass"['$===']($case)) {block = self.$build_block(block_context, "raw", terminator, parent, reader, attributes)}else if ("math"['$===']($case) || "latexmath"['$===']($case) || "asciimath"['$===']($case)) {if (block_context['$==']("math")) {
            attributes['$[]=']("style", (function() {if (((default_math_syntax = document.$attributes()['$[]']("math").$to_s()))['$==']("")) {
              return "asciimath"
              } else {
              return default_math_syntax
            }; return nil; })())};
          block = self.$build_block("math", "raw", terminator, parent, reader, attributes);}else if ("open"['$===']($case) || "sidebar"['$===']($case)) {block = self.$build_block(block_context, "compound", terminator, parent, reader, attributes)}else if ("table"['$===']($case)) {cursor = reader.$cursor();
          block_reader = $opalScope.Reader.$new(reader.$read_lines_until($hash2(["terminator", "skip_line_comments"], {"terminator": terminator, "skip_line_comments": true})), cursor);
          $case = terminator['$[]']($range(0, 0, false));if (","['$===']($case)) {attributes['$[]=']("format", "csv")}else if (":"['$===']($case)) {attributes['$[]=']("format", "dsv")};
          block = self.$next_table(block_reader, parent, attributes);}else if ("quote"['$===']($case) || "verse"['$===']($case)) {$opalScope.AttributeList.$rekey(attributes, [nil, "attribution", "citetitle"]);
          block = self.$build_block(block_context, ((function() {if (block_context['$==']("verse")) {
            return "verbatim"
            } else {
            return "compound"
          }; return nil; })()), terminator, parent, reader, attributes);}else {if (($b = (($c = block_extensions !== false && block_extensions !== nil) ? extensions['$processor_registered_for_block?'](block_context, cloaked_context) : $c)) !== false && $b !== nil) {
            processor = extensions.$load_block_processor(block_context, document);
            if (($b = ($c = ((content_model = processor.$options()['$[]']("content_model")))['$==']("skip"), ($c === nil || $c === false))) !== false && $b !== nil) {
              if (($b = ($c = ((pos_attrs = processor.$options().$fetch("pos_attrs", [])))['$empty?'](), ($c === nil || $c === false))) !== false && $b !== nil) {
                $opalScope.AttributeList.$rekey(attributes, [nil].$concat(pos_attrs))};
              if (($b = ($c = ((default_attrs = processor.$options().$fetch("default_attrs", $hash2([], {}))))['$empty?'](), ($c === nil || $c === false))) !== false && $b !== nil) {
                ($b = ($c = default_attrs).$each, $b._p = (TMP_8 = function(k, v){var self = TMP_8._s || this, $a, $b, $c;if (k == null) k = nil;if (v == null) v = nil;
                return ($a = k, $b = attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, v)))}, TMP_8._s = self, TMP_8), $b).call($c)};};
            block = self.$build_block(block_context, content_model, terminator, parent, reader, attributes, $hash2(["processor"], {"processor": processor}));
            if (($b = block['$nil?']()) !== false && $b !== nil) {
              return nil};
            } else {
            self.$raise("Unsupported block type " + (block_context) + " at " + (reader.$line_info()))
          }};};};
        if (($a = ($b = block['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          if (($a = attributes['$has_key?']("id")) !== false && $a !== nil) {
            ($a = block, ((($b = $a.$id()) !== false && $b !== nil) ? $b : $a['$id='](attributes['$[]']("id"))))};
          if (($a = block['$title?']()) === false || $a === nil) {
            block['$title='](attributes['$[]']("title"))};
          ($a = block, ((($b = $a.$caption()) !== false && $b !== nil) ? $b : $a['$caption='](attributes.$delete("caption"))));
          block['$style='](attributes['$[]']("style"));
          if (($a = block.$id()) !== false && $a !== nil) {
            document.$register("ids", [block.$id(), (((($a = attributes['$[]']("reftext")) !== false && $a !== nil) ? $a : ((function() {if (($b = block['$title?']()) !== false && $b !== nil) {
              return block.$title()
              } else {
              return nil
            }; return nil; })())))])};
          block.$update_attributes(attributes);
          block.$lock_in_subs();
          if (($a = block['$sub?']("callouts")) !== false && $a !== nil) {
            if (($a = ($b = (self.$catalog_callouts(block.$source(), document)), ($b === nil || $b === false))) !== false && $a !== nil) {
              block.$remove_sub("callouts")}};};
        return block;
      });

      $opal.defs(self, '$is_delimited_block?', function(line, return_match_data) {
        var $a, $b, $c, self = this, line_len = nil, tip = nil, tl = nil, fenced_code = nil, tip_3 = nil, context = nil, masq = nil;
        if (return_match_data == null) {
          return_match_data = false
        }
        if (($a = (($b = ((line_len = line.$length()))['$>'](1)) ? ($opalScope.DELIMITED_BLOCK_LEADERS['$include?'](line['$[]']($range(0, 1, false)))) : $b)) === false || $a === nil) {
          return nil};
        if (line_len['$=='](2)) {
          tip = line;
          tl = 2;
          } else {
          if (line_len['$<='](4)) {
            tip = line;
            tl = line_len;
            } else {
            tip = line['$[]']($range(0, 3, false));
            tl = 4;
          };
          fenced_code = false;
          if (($a = $opalScope.Compliance.$markdown_syntax()) !== false && $a !== nil) {
            tip_3 = ((function() {if (tl['$=='](4)) {
              return tip.$chop()
              } else {
              return tip
            }; return nil; })());
            if (tip_3['$==']("```")) {
              if (($a = (($b = tl['$=='](4)) ? (tip['$end_with?']("`")) : $b)) !== false && $a !== nil) {
                return nil};
              tip = tip_3;
              tl = 3;
              fenced_code = true;
            } else if (tip_3['$==']("~~~")) {
              if (($a = (($b = tl['$=='](4)) ? (tip['$end_with?']("~")) : $b)) !== false && $a !== nil) {
                return nil};
              tip = tip_3;
              tl = 3;
              fenced_code = true;};};
          if (($a = (($b = tl['$=='](3)) ? ($c = fenced_code, ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
            return nil};
        };
        if (($a = $opalScope.DELIMITED_BLOCKS['$has_key?'](tip)) !== false && $a !== nil) {
          if (($a = ((($b = tl['$<'](4)) !== false && $b !== nil) ? $b : tl['$=='](line_len))) !== false && $a !== nil) {
            if (return_match_data !== false && return_match_data !== nil) {
              ($a = $opalScope.DELIMITED_BLOCKS['$[]'](tip))['$to_a'] ? ($a = $a['$to_a']()) : ($a)._isArray ? $a : ($a = [$a]), context = ($a[0] == null ? nil : $a[0]), masq = ($a[1] == null ? nil : $a[1]);
              return $opalScope.BlockMatchData.$new(context, masq, tip, tip);
              } else {
              return true
            }
          } else if (((("") + (tip)) + (tip['$[]']($range(-1, -1, false))['$*']((line_len['$-'](tl)))))['$=='](line)) {
            if (return_match_data !== false && return_match_data !== nil) {
              ($a = $opalScope.DELIMITED_BLOCKS['$[]'](tip))['$to_a'] ? ($a = $a['$to_a']()) : ($a)._isArray ? $a : ($a = [$a]), context = ($a[0] == null ? nil : $a[0]), masq = ($a[1] == null ? nil : $a[1]);
              return $opalScope.BlockMatchData.$new(context, masq, tip, line);
              } else {
              return true
            }
            } else {
            return nil
          }
          } else {
          return nil
        };
      });

      $opal.defs(self, '$build_block', function(block_context, content_model, terminator, parent, reader, attributes, options) {
        var $a, $b, TMP_9, $c, self = this, skip_processing = nil, parse_as_content_model = nil, lines = nil, block_reader = nil, cursor = nil, processor = nil, block = nil;
        if (options == null) {
          options = $hash2([], {})
        }
        if (($a = ((($b = content_model['$==']("skip")) !== false && $b !== nil) ? $b : content_model['$==']("raw"))) !== false && $a !== nil) {
          skip_processing = content_model['$==']("skip");
          parse_as_content_model = "simple";
          } else {
          skip_processing = false;
          parse_as_content_model = content_model;
        };
        if (($a = terminator['$nil?']()) !== false && $a !== nil) {
          if (parse_as_content_model['$==']("verbatim")) {
            lines = reader.$read_lines_until($hash2(["break_on_blank_lines", "break_on_list_continuation"], {"break_on_blank_lines": true, "break_on_list_continuation": true}))
            } else {
            if (content_model['$==']("compound")) {
              content_model = "simple"};
            lines = ($a = ($b = reader).$read_lines_until, $a._p = (TMP_9 = function(line){var self = TMP_9._s || this, $a, $b;if (line == null) line = nil;
            return ($a = $opalScope.Compliance.$block_terminates_paragraph(), $a !== false && $a !== nil ?(((($b = self['$is_delimited_block?'](line)) !== false && $b !== nil) ? $b : line.$match($opalScope.REGEXP['$[]']("attr_line")))) : $a)}, TMP_9._s = self, TMP_9), $a).call($b, $hash2(["break_on_blank_lines", "break_on_list_continuation", "preserve_last_line", "skip_line_comments", "skip_processing"], {"break_on_blank_lines": true, "break_on_list_continuation": true, "preserve_last_line": true, "skip_line_comments": true, "skip_processing": skip_processing}));
          };
          block_reader = nil;
        } else if (($a = ($c = parse_as_content_model['$==']("compound"), ($c === nil || $c === false))) !== false && $a !== nil) {
          lines = reader.$read_lines_until($hash2(["terminator", "skip_processing"], {"terminator": terminator, "skip_processing": skip_processing}));
          block_reader = nil;
        } else if (terminator['$=='](false)) {
          lines = nil;
          block_reader = reader;
          } else {
          lines = nil;
          cursor = reader.$cursor();
          block_reader = $opalScope.Reader.$new(reader.$read_lines_until($hash2(["terminator", "skip_processing"], {"terminator": terminator, "skip_processing": skip_processing})), cursor);
        };
        if (content_model['$==']("skip")) {
          attributes.$clear();
          return lines;};
        if (($a = (($c = content_model['$==']("verbatim")) ? attributes['$has_key?']("indent") : $c)) !== false && $a !== nil) {
          self['$reset_block_indent!'](lines, attributes['$[]']("indent").$to_i())};
        if (($a = (processor = options['$[]']("processor"))) !== false && $a !== nil) {
          attributes.$delete("style");
          processor.$options()['$[]=']("content_model", content_model);
          block = processor.$process(parent, ((($a = block_reader) !== false && $a !== nil) ? $a : $opalScope.Reader.$new(lines)), attributes);
          } else {
          block = $opalScope.Block.$new(parent, block_context, $hash2(["content_model", "attributes", "source"], {"content_model": content_model, "attributes": attributes, "source": lines}))
        };
        if (($a = options.$fetch("supports_caption", false)) !== false && $a !== nil) {
          if (($a = attributes['$has_key?']("title")) !== false && $a !== nil) {
            block['$title='](attributes.$delete("title"))};
          block.$assign_caption(attributes.$delete("caption"));};
        if (content_model['$==']("compound")) {
          self.$parse_blocks(block_reader, block)};
        return block;
      });

      $opal.defs(self, '$parse_blocks', function(reader, parent) {
        var $a, $b, self = this, block = nil;
        while (($b = reader['$has_more_lines?']()) !== false && $b !== nil) {
        block = $opalScope.Lexer.$next_block(reader, parent);
        if (($b = block['$nil?']()) === false || $b === nil) {
          parent['$<<'](block)};};
      });

      $opal.defs(self, '$next_outline_list', function(reader, list_type, parent) {
        var $a, $b, $c, $d, self = this, list_block = nil, match = nil, marker = nil, this_item_level = nil, ancestor = nil, list_item = nil;
        list_block = $opalScope.List.$new(parent, list_type);
        if (parent.$context()['$=='](list_type)) {
          list_block['$level='](parent.$level()['$+'](1))
          } else {
          list_block['$level='](1)
        };
        while (($b = ($c = reader['$has_more_lines?'](), $c !== false && $c !== nil ?(match = reader.$peek_line().$match($opalScope.REGEXP['$[]'](list_type))) : $c)) !== false && $b !== nil) {
        marker = self.$resolve_list_marker(list_type, match['$[]'](1));
        if (($b = ($c = list_block['$items?'](), $c !== false && $c !== nil ?($d = marker['$=='](list_block.$items().$first().$marker()), ($d === nil || $d === false)) : $c)) !== false && $b !== nil) {
          this_item_level = list_block.$level()['$+'](1);
          ancestor = parent;
          while (ancestor.$context()['$=='](list_type)) {
          if (marker['$=='](ancestor.$items().$first().$marker())) {
            this_item_level = ancestor.$level();
            break;;};
          ancestor = ancestor.$parent();};
          } else {
          this_item_level = list_block.$level()
        };
        if (($b = ((($c = ($d = list_block['$items?'](), ($d === nil || $d === false))) !== false && $c !== nil) ? $c : this_item_level['$=='](list_block.$level()))) !== false && $b !== nil) {
          list_item = self.$next_list_item(reader, list_block, match)
        } else if (this_item_level['$<'](list_block.$level())) {
          break;
        } else if (this_item_level['$>'](list_block.$level())) {
          list_block.$items().$last()['$<<'](self.$next_block(reader, list_block))};
        if (($b = list_item['$nil?']()) === false || $b === nil) {
          list_block['$<<'](list_item)};
        list_item = nil;
        reader.$skip_blank_lines();};
        return list_block;
      });

      $opal.defs(self, '$catalog_callouts', function(text, document) {
        var $a, $b, TMP_10, self = this, found = nil;
        found = false;
        if (($a = text['$include?']("<")) !== false && $a !== nil) {
          ($a = ($b = text).$scan, $a._p = (TMP_10 = function(){var self = TMP_10._s || this, $a, $b, m = nil;
          m = $gvars["~"];
            if (($a = ($b = m['$[]'](0)['$[]']($range(0, 0, false))['$==']("\\"), ($b === nil || $b === false))) !== false && $a !== nil) {
              document.$callouts().$register(m['$[]'](2))};
            return found = true;}, TMP_10._s = self, TMP_10), $a).call($b, $opalScope.REGEXP['$[]']("callout_quick_scan"))};
        return found;
      });

      $opal.defs(self, '$catalog_inline_anchors', function(text, document) {
        var $a, $b, TMP_11, self = this;
        if (($a = text['$include?']("[")) !== false && $a !== nil) {
          ($a = ($b = text).$scan, $a._p = (TMP_11 = function(){var self = TMP_11._s || this, $a, m = nil, id = nil, reftext = nil;
          m = $gvars["~"];
            if (($a = m['$[]'](0)['$start_with?']("\\")) !== false && $a !== nil) {
              return nil;};
            id = ((($a = m['$[]'](1)) !== false && $a !== nil) ? $a : m['$[]'](3));
            reftext = ((($a = m['$[]'](2)) !== false && $a !== nil) ? $a : m['$[]'](4));
            return document.$register("ids", [id, reftext]);}, TMP_11._s = self, TMP_11), $a).call($b, $opalScope.REGEXP['$[]']("anchor_macro"))};
        return nil;
      });

      $opal.defs(self, '$next_labeled_list', function(reader, match, parent) {
        var $a, $b, $c, $d, self = this, list_block = nil, previous_pair = nil, sibling_pattern = nil, term = nil, item = nil;
        list_block = $opalScope.List.$new(parent, "dlist");
        previous_pair = nil;
        sibling_pattern = $opalScope.REGEXP['$[]']("dlist_siblings")['$[]'](match['$[]'](2));
        while (($b = ($c = reader['$has_more_lines?'](), $c !== false && $c !== nil ?match = reader.$peek_line().$match(sibling_pattern) : $c)) !== false && $b !== nil) {
        $b = $opal.to_ary(self.$next_list_item(reader, list_block, match, sibling_pattern)), term = ($b[0] == null ? nil : $b[0]), item = ($b[1] == null ? nil : $b[1]);
        if (($b = ($c = ($d = previous_pair['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?previous_pair.$last()['$nil?']() : $c)) !== false && $b !== nil) {
          previous_pair.$pop();
          previous_pair['$[]'](0)['$<<'](term);
          previous_pair['$<<'](item);
          } else {
          list_block.$items()['$<<']((previous_pair = [[term], item]))
        };};
        return list_block;
      });

      $opal.defs(self, '$next_list_item', function(reader, list_block, match, sibling_trait) {
        var $a, $b, $c, self = this, list_type = nil, list_term = nil, list_item = nil, has_text = nil, text = nil, checkbox = nil, checked = nil, cursor = nil, list_item_reader = nil, comment_lines = nil, subsequent_line = nil, continuation_connects_first_block = nil, content_adjacent = nil, options = nil, new_block = nil;
        if (sibling_trait == null) {
          sibling_trait = nil
        }
        list_type = list_block.$context();
        if (list_type['$==']("dlist")) {
          list_term = $opalScope.ListItem.$new(list_block, match['$[]'](1));
          list_item = $opalScope.ListItem.$new(list_block, match['$[]'](3));
          has_text = ($a = match['$[]'](3).$to_s()['$empty?'](), ($a === nil || $a === false));
          } else {
          text = match['$[]'](2);
          checkbox = false;
          if (($a = (($b = list_type['$==']("ulist")) ? text['$start_with?']("[") : $b)) !== false && $a !== nil) {
            if (($a = text['$start_with?']("[ ] ")) !== false && $a !== nil) {
              checkbox = true;
              checked = false;
              text = text['$[]']($range(3, -1, false)).$lstrip();
            } else if (($a = ((($b = text['$start_with?']("[*] ")) !== false && $b !== nil) ? $b : text['$start_with?']("[x] "))) !== false && $a !== nil) {
              checkbox = true;
              checked = true;
              text = text['$[]']($range(3, -1, false)).$lstrip();}};
          list_item = $opalScope.ListItem.$new(list_block, text);
          if (checkbox !== false && checkbox !== nil) {
            list_block.$attributes()['$[]=']("checklist-option", "");
            list_item.$attributes()['$[]=']("checkbox", "");
            if (checked !== false && checked !== nil) {
              list_item.$attributes()['$[]=']("checked", "")};};
          if (($a = ($b = sibling_trait, ($b === nil || $b === false))) !== false && $a !== nil) {
            sibling_trait = self.$resolve_list_marker(list_type, match['$[]'](1), list_block.$items().$size(), true, reader)};
          list_item['$marker='](sibling_trait);
          has_text = true;
        };
        reader.$advance();
        cursor = reader.$cursor();
        list_item_reader = $opalScope.Reader.$new(self.$read_lines_for_list_item(reader, list_type, sibling_trait, has_text), cursor);
        if (($a = list_item_reader['$has_more_lines?']()) !== false && $a !== nil) {
          comment_lines = list_item_reader.$skip_line_comments();
          subsequent_line = list_item_reader.$peek_line();
          if (($a = comment_lines['$empty?']()) === false || $a === nil) {
            list_item_reader.$unshift_lines(comment_lines)};
          if (($a = ($b = subsequent_line['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
            continuation_connects_first_block = subsequent_line['$empty?']();
            if (($a = ($b = ($c = continuation_connects_first_block, ($c === nil || $c === false)), $b !== false && $b !== nil ?($c = list_type['$==']("dlist"), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
              has_text = false};
            content_adjacent = ($a = ($b = continuation_connects_first_block, ($b === nil || $b === false)), $a !== false && $a !== nil ?($b = subsequent_line['$empty?'](), ($b === nil || $b === false)) : $a);
            } else {
            continuation_connects_first_block = false;
            content_adjacent = false;
          };
          options = $hash2(["text"], {"text": ($a = has_text, ($a === nil || $a === false))});
          while (($b = list_item_reader['$has_more_lines?']()) !== false && $b !== nil) {
          new_block = self.$next_block(list_item_reader, list_block, $hash2([], {}), options);
          if (($b = new_block['$nil?']()) === false || $b === nil) {
            list_item['$<<'](new_block)};};
          list_item.$fold_first(continuation_connects_first_block, content_adjacent);};
        if (list_type['$==']("dlist")) {
          if (($a = ((($b = list_item['$text?']()) !== false && $b !== nil) ? $b : list_item['$blocks?']())) === false || $a === nil) {
            list_item = nil};
          return [list_term, list_item];
          } else {
          return list_item
        };
      });

      $opal.defs(self, '$read_lines_for_list_item', function(reader, list_type, sibling_trait, has_text) {
        var $a, $b, $c, $d, $e, TMP_12, TMP_13, $f, TMP_14, TMP_15, $g, $h, TMP_16, $i, self = this, buffer = nil, continuation = nil, within_nested_list = nil, detached_continuation = nil, this_line = nil, prev_line = nil, match = nil, nested_list_type = nil;
        if (sibling_trait == null) {
          sibling_trait = nil
        }
        if (has_text == null) {
          has_text = true
        }
        buffer = [];
        continuation = "inactive";
        within_nested_list = false;
        detached_continuation = nil;
        while (($b = reader['$has_more_lines?']()) !== false && $b !== nil) {
        this_line = reader.$read_line();
        if (($b = self['$is_sibling_list_item?'](this_line, list_type, sibling_trait)) !== false && $b !== nil) {
          break;};
        prev_line = (function() {if (($b = buffer['$empty?']()) !== false && $b !== nil) {
          return nil
          } else {
          return buffer.$last()
        }; return nil; })();
        if (prev_line['$==']($opalScope.LIST_CONTINUATION)) {
          if (continuation['$==']("inactive")) {
            continuation = "active";
            has_text = true;
            if (($b = within_nested_list) === false || $b === nil) {
              buffer['$[]='](-1, "")};};
          if (this_line['$==']($opalScope.LIST_CONTINUATION)) {
            if (($b = ($c = continuation['$==']("frozen"), ($c === nil || $c === false))) !== false && $b !== nil) {
              continuation = "frozen";
              buffer['$<<'](this_line);};
            this_line = nil;
            continue;;};};
        if (($b = match = self['$is_delimited_block?'](this_line, true)) !== false && $b !== nil) {
          if (continuation['$==']("active")) {
            buffer['$<<'](this_line);
            buffer.$concat(reader.$read_lines_until($hash2(["terminator", "read_last_line"], {"terminator": match.$terminator(), "read_last_line": true})));
            continuation = "inactive";
            } else {
            break;
          }
        } else if (($b = ($c = (($d = list_type['$==']("dlist")) ? ($e = continuation['$==']("active"), ($e === nil || $e === false)) : $d), $c !== false && $c !== nil ?this_line.$match($opalScope.REGEXP['$[]']("attr_line")) : $c)) !== false && $b !== nil) {
          break;
        } else if (($b = (($c = continuation['$==']("active")) ? ($d = this_line['$empty?'](), ($d === nil || $d === false)) : $c)) !== false && $b !== nil) {
          if (($b = this_line.$match($opalScope.REGEXP['$[]']("lit_par"))) !== false && $b !== nil) {
            reader.$unshift_line(this_line);
            buffer.$concat(($b = ($c = reader).$read_lines_until, $b._p = (TMP_12 = function(line){var self = TMP_12._s || this, $a;if (line == null) line = nil;
            return (($a = list_type['$==']("dlist")) ? self['$is_sibling_list_item?'](line, list_type, sibling_trait) : $a)}, TMP_12._s = self, TMP_12), $b).call($c, $hash2(["preserve_last_line", "break_on_blank_lines", "break_on_list_continuation"], {"preserve_last_line": true, "break_on_blank_lines": true, "break_on_list_continuation": true})));
            continuation = "inactive";
          } else if (($b = ((($d = ((($e = this_line.$match($opalScope.REGEXP['$[]']("blk_title"))) !== false && $e !== nil) ? $e : this_line.$match($opalScope.REGEXP['$[]']("attr_line")))) !== false && $d !== nil) ? $d : this_line.$match($opalScope.REGEXP['$[]']("attr_entry")))) !== false && $b !== nil) {
            buffer['$<<'](this_line)
            } else {
            if (($b = nested_list_type = ($d = ($e = ((function() {if (within_nested_list !== false && within_nested_list !== nil) {
              return ["dlist"]
              } else {
              return $opalScope.NESTABLE_LIST_CONTEXTS
            }; return nil; })())).$detect, $d._p = (TMP_13 = function(ctx){var self = TMP_13._s || this;if (ctx == null) ctx = nil;
            return this_line.$match($opalScope.REGEXP['$[]'](ctx))}, TMP_13._s = self, TMP_13), $d).call($e)) !== false && $b !== nil) {
              within_nested_list = true;
              if (($b = (($d = nested_list_type['$==']("dlist")) ? $gvars["~"]['$[]'](3).$to_s()['$empty?']() : $d)) !== false && $b !== nil) {
                has_text = false};};
            buffer['$<<'](this_line);
            continuation = "inactive";
          }
        } else if (($b = ($d = ($f = prev_line['$nil?'](), ($f === nil || $f === false)), $d !== false && $d !== nil ?prev_line['$empty?']() : $d)) !== false && $b !== nil) {
          if (($b = this_line['$empty?']()) !== false && $b !== nil) {
            reader.$skip_blank_lines();
            this_line = reader.$read_line();
            if (($b = ((($d = this_line['$nil?']()) !== false && $d !== nil) ? $d : self['$is_sibling_list_item?'](this_line, list_type, sibling_trait))) !== false && $b !== nil) {
              break;};};
          if (this_line['$==']($opalScope.LIST_CONTINUATION)) {
            detached_continuation = buffer.$size();
            buffer['$<<'](this_line);
          } else if (has_text !== false && has_text !== nil) {
            if (($b = self['$is_sibling_list_item?'](this_line, list_type, sibling_trait)) !== false && $b !== nil) {
              break;
            } else if (($b = nested_list_type = ($d = ($f = $opalScope.NESTABLE_LIST_CONTEXTS).$detect, $d._p = (TMP_14 = function(ctx){var self = TMP_14._s || this;if (ctx == null) ctx = nil;
            return this_line.$match($opalScope.REGEXP['$[]'](ctx))}, TMP_14._s = self, TMP_14), $d).call($f)) !== false && $b !== nil) {
              buffer['$<<'](this_line);
              within_nested_list = true;
              if (($b = (($d = nested_list_type['$==']("dlist")) ? $gvars["~"]['$[]'](3).$to_s()['$empty?']() : $d)) !== false && $b !== nil) {
                has_text = false};
            } else if (($b = this_line.$match($opalScope.REGEXP['$[]']("lit_par"))) !== false && $b !== nil) {
              reader.$unshift_line(this_line);
              buffer.$concat(($b = ($d = reader).$read_lines_until, $b._p = (TMP_15 = function(line){var self = TMP_15._s || this, $a;if (line == null) line = nil;
              return (($a = list_type['$==']("dlist")) ? self['$is_sibling_list_item?'](line, list_type, sibling_trait) : $a)}, TMP_15._s = self, TMP_15), $b).call($d, $hash2(["preserve_last_line", "break_on_blank_lines", "break_on_list_continuation"], {"preserve_last_line": true, "break_on_blank_lines": true, "break_on_list_continuation": true})));
              } else {
              break;
            }
            } else {
            if (($b = within_nested_list) === false || $b === nil) {
              buffer.$pop()};
            buffer['$<<'](this_line);
            has_text = true;
          };
          } else {
          if (($b = ($g = this_line['$empty?'](), ($g === nil || $g === false))) !== false && $b !== nil) {
            has_text = true};
          if (($b = nested_list_type = ($g = ($h = ((function() {if (within_nested_list !== false && within_nested_list !== nil) {
            return ["dlist"]
            } else {
            return $opalScope.NESTABLE_LIST_CONTEXTS
          }; return nil; })())).$detect, $g._p = (TMP_16 = function(ctx){var self = TMP_16._s || this;if (ctx == null) ctx = nil;
          return this_line.$match($opalScope.REGEXP['$[]'](ctx))}, TMP_16._s = self, TMP_16), $g).call($h)) !== false && $b !== nil) {
            within_nested_list = true;
            if (($b = (($g = nested_list_type['$==']("dlist")) ? $gvars["~"]['$[]'](3).$to_s()['$empty?']() : $g)) !== false && $b !== nil) {
              has_text = false};};
          buffer['$<<'](this_line);
        };
        this_line = nil;};
        if (($a = ($b = this_line['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          reader.$unshift_line(this_line)};
        if (detached_continuation !== false && detached_continuation !== nil) {
          buffer.$delete_at(detached_continuation)};
        while (($b = ($g = ($i = buffer['$empty?'](), ($i === nil || $i === false)), $g !== false && $g !== nil ?buffer.$last()['$empty?']() : $g)) !== false && $b !== nil) {
        buffer.$pop()};
        if (($a = ($b = ($g = buffer['$empty?'](), ($g === nil || $g === false)), $b !== false && $b !== nil ?buffer.$last()['$==']($opalScope.LIST_CONTINUATION) : $b)) !== false && $a !== nil) {
          buffer.$pop()};
        return buffer;
      });

      $opal.defs(self, '$initialize_section', function(reader, parent, attributes) {
        var $a, $b, self = this, document = nil, sect_id = nil, sect_reftext = nil, sect_title = nil, sect_level = nil, _ = nil, section = nil, id = nil;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        document = parent.$document();
        $a = $opal.to_ary(self.$parse_section_title(reader, document)), sect_id = ($a[0] == null ? nil : $a[0]), sect_reftext = ($a[1] == null ? nil : $a[1]), sect_title = ($a[2] == null ? nil : $a[2]), sect_level = ($a[3] == null ? nil : $a[3]), _ = ($a[4] == null ? nil : $a[4]);
        if (sect_reftext !== false && sect_reftext !== nil) {
          attributes['$[]=']("reftext", sect_reftext)};
        section = $opalScope.Section.$new(parent, sect_level, document.$attributes()['$has_key?']("numbered"));
        section['$id='](sect_id);
        section['$title='](sect_title);
        if (($a = attributes['$[]'](1)) !== false && $a !== nil) {
          $a = $opal.to_ary(self.$parse_style_attribute(attributes, reader)), section['$sectname='](($a[0] == null ? nil : $a[0])), _ = ($a[1] == null ? nil : $a[1]);
          section['$special='](true);
          if (($a = (($b = section.$sectname()['$==']("abstract")) ? document.$doctype()['$==']("book") : $b)) !== false && $a !== nil) {
            section['$sectname=']("sect1");
            section['$special='](false);
            section['$level='](1);};
        } else if (($a = (($b = sect_title.$downcase()['$==']("synopsis")) ? document.$doctype()['$==']("manpage") : $b)) !== false && $a !== nil) {
          section['$special='](true);
          section['$sectname=']("synopsis");
          } else {
          section['$sectname=']("sect" + (section.$level()))
        };
        if (($a = ($b = section.$id()['$nil?'](), $b !== false && $b !== nil ?(id = attributes['$[]']("id")) : $b)) !== false && $a !== nil) {
          section['$id='](id)
          } else {
          ($a = section, ((($b = $a.$id()) !== false && $b !== nil) ? $b : $a['$id='](section.$generate_id())))
        };
        if (($a = section.$id()) !== false && $a !== nil) {
          section.$document().$register("ids", [section.$id(), (((($a = attributes['$[]']("reftext")) !== false && $a !== nil) ? $a : section.$title()))])};
        section.$update_attributes(attributes);
        reader.$skip_blank_lines();
        return section;
      });

      $opal.defs(self, '$section_level', function(line) {
        var self = this;
        return $opalScope.SECTION_LEVELS['$[]'](line['$[]']($range(0, 0, false)));
      });

      $opal.defs(self, '$single_line_section_level', function(marker) {
        var self = this;
        return marker.$length()['$-'](1);
      });

      $opal.defs(self, '$is_next_line_section?', function(reader, attributes) {
        var $a, $b, $c, $d, self = this, val = nil, ord_0 = nil;
        if (($a = ($b = ($c = ($d = ((val = attributes['$[]'](1)))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?(((($d = ((ord_0 = val['$[]'](0).$ord()))['$=='](100)) !== false && $d !== nil) ? $d : ord_0['$=='](102))) : $c), $b !== false && $b !== nil ?(val.$match($opalScope.REGEXP['$[]']("section_float_style"))) : $b)) !== false && $a !== nil) {
          return false};
        if (($a = ($b = reader['$has_more_lines?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          return false};
        if (($a = $opalScope.Compliance.$underline_style_section_titles()) !== false && $a !== nil) {
          return ($a = self)['$is_section_title?'].apply($a, [].concat(reader.$peek_lines(2)))
          } else {
          return self['$is_section_title?'](reader.$peek_line())
        };
      });

      $opal.defs(self, '$is_next_line_document_title?', function(reader, attributes) {
        var self = this;
        return self['$is_next_line_section?'](reader, attributes)['$=='](0);
      });

      $opal.defs(self, '$is_section_title?', function(line1, line2) {
        var $a, $b, self = this, level = nil;
        if (line2 == null) {
          line2 = nil
        }
        if (($a = (level = self['$is_single_line_section_title?'](line1))) !== false && $a !== nil) {
          return level
        } else if (($a = (($b = line2 !== false && line2 !== nil) ? (level = self['$is_two_line_section_title?'](line1, line2)) : $b)) !== false && $a !== nil) {
          return level
          } else {
          return false
        };
      });

      $opal.defs(self, '$is_single_line_section_title?', function(line1) {
        var $a, $b, $c, $d, self = this, first_char = nil, match = nil;
        first_char = (function() {if (($a = line1['$nil?']()) !== false && $a !== nil) {
          return nil
          } else {
          return line1['$[]']($range(0, 0, false))
        }; return nil; })();
        if (($a = ($b = (((($c = first_char['$==']("=")) !== false && $c !== nil) ? $c : (($d = $opalScope.Compliance.$markdown_syntax(), $d !== false && $d !== nil ?first_char['$==']("#") : $d)))), $b !== false && $b !== nil ?(match = line1.$match($opalScope.REGEXP['$[]']("section_title"))) : $b)) !== false && $a !== nil) {
          return self.$single_line_section_level(match['$[]'](1))
          } else {
          return false
        };
      });

      $opal.defs(self, '$is_two_line_section_title?', function(line1, line2) {
        var $a, $b, $c, $d, $e, $f, $g, self = this;
        if (($a = ($b = ($c = ($d = ($e = ($f = ($g = line1['$nil?'](), ($g === nil || $g === false)), $f !== false && $f !== nil ?($g = line2['$nil?'](), ($g === nil || $g === false)) : $f), $e !== false && $e !== nil ?$opalScope.SECTION_LEVELS['$has_key?'](line2['$[]']($range(0, 0, false))) : $e), $d !== false && $d !== nil ?line2.$match($opalScope.REGEXP['$[]']("section_underline")) : $d), $c !== false && $c !== nil ?line1.$match($opalScope.REGEXP['$[]']("section_name")) : $c), $b !== false && $b !== nil ?(self.$line_length(line1)['$-'](self.$line_length(line2))).$abs()['$<='](1) : $b)) !== false && $a !== nil) {
          return self.$section_level(line2)
          } else {
          return false
        };
      });

      $opal.defs(self, '$parse_section_title', function(reader, document) {
        var $a, $b, $c, $d, $e, $f, self = this, line1 = nil, sect_id = nil, sect_title = nil, sect_level = nil, sect_reftext = nil, single_line = nil, first_char = nil, match = nil, anchor_match = nil, line2 = nil, name_match = nil;
        line1 = reader.$read_line();
        sect_id = nil;
        sect_title = nil;
        sect_level = -1;
        sect_reftext = nil;
        single_line = true;
        first_char = line1['$[]']($range(0, 0, false));
        if (($a = ($b = (((($c = first_char['$==']("=")) !== false && $c !== nil) ? $c : (($d = $opalScope.Compliance.$markdown_syntax(), $d !== false && $d !== nil ?first_char['$==']("#") : $d)))), $b !== false && $b !== nil ?(match = line1.$match($opalScope.REGEXP['$[]']("section_title"))) : $b)) !== false && $a !== nil) {
          sect_level = self.$single_line_section_level(match['$[]'](1));
          sect_title = match['$[]'](2);
          if (($a = ($b = (sect_title['$end_with?']("]]")), $b !== false && $b !== nil ?(anchor_match = (sect_title.$match($opalScope.REGEXP['$[]']("anchor_embedded")))) : $b)) !== false && $a !== nil) {
            if (($a = anchor_match['$[]'](2)['$nil?']()) !== false && $a !== nil) {
              sect_title = anchor_match['$[]'](1);
              sect_id = anchor_match['$[]'](3);
              sect_reftext = anchor_match['$[]'](4);}};
        } else if (($a = $opalScope.Compliance.$underline_style_section_titles()) !== false && $a !== nil) {
          line2 = reader.$peek_line(true);
          if (($a = ($b = ($c = ($d = ($e = ($f = line2['$nil?'](), ($f === nil || $f === false)), $e !== false && $e !== nil ?$opalScope.SECTION_LEVELS['$has_key?'](line2['$[]']($range(0, 0, false))) : $e), $d !== false && $d !== nil ?line2.$match($opalScope.REGEXP['$[]']("section_underline")) : $d), $c !== false && $c !== nil ?(name_match = line1.$match($opalScope.REGEXP['$[]']("section_name"))) : $c), $b !== false && $b !== nil ?(self.$line_length(line1)['$-'](self.$line_length(line2))).$abs()['$<='](1) : $b)) !== false && $a !== nil) {
            sect_title = name_match['$[]'](1);
            if (($a = ($b = (sect_title['$end_with?']("]]")), $b !== false && $b !== nil ?(anchor_match = (sect_title.$match($opalScope.REGEXP['$[]']("anchor_embedded")))) : $b)) !== false && $a !== nil) {
              if (($a = anchor_match['$[]'](2)['$nil?']()) !== false && $a !== nil) {
                sect_title = anchor_match['$[]'](1);
                sect_id = anchor_match['$[]'](3);
                sect_reftext = anchor_match['$[]'](4);}};
            sect_level = self.$section_level(line2);
            single_line = false;
            reader.$advance();};};
        if (sect_level['$>='](0)) {
          sect_level = sect_level['$+'](document.$attr("leveloffset", 0).$to_i())};
        return [sect_id, sect_reftext, sect_title, sect_level, single_line];
      });

      $opal.defs(self, '$line_length', function(line) {
        var $a, self = this;
        if (($a = $opalScope.FORCE_UNICODE_LINE_LENGTH) !== false && $a !== nil) {
          return line.$scan(/./i).$length()
          } else {
          return line.$length()
        };
      });

      $opal.defs(self, '$parse_header_metadata', function(reader, document) {
        var $a, $b, $c, TMP_17, $d, TMP_18, $e, self = this, metadata = nil, implicit_author = nil, implicit_authors = nil, author_metadata = nil, rev_metadata = nil, rev_line = nil, match = nil, author_line = nil, authors = nil, author_key = nil;
        if (document == null) {
          document = nil
        }
        self.$process_attribute_entries(reader, document);
        metadata = $hash2([], {});
        implicit_author = nil;
        implicit_authors = nil;
        if (($a = ($b = reader['$has_more_lines?'](), $b !== false && $b !== nil ?($c = reader['$next_line_empty?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          author_metadata = self.$process_authors(reader.$read_line());
          if (($a = author_metadata['$empty?']()) === false || $a === nil) {
            if (($a = ($b = document['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              ($a = ($b = author_metadata).$each, $a._p = (TMP_17 = function(key, val){var self = TMP_17._s || this, $a;if (key == null) key = nil;if (val == null) val = nil;
              if (($a = document.$attributes()['$has_key?'](key)) !== false && $a !== nil) {
                  return nil
                  } else {
                  return document.$attributes()['$[]='](key, ((function() {if (($a = (val['$is_a?']($opalScope.String))) !== false && $a !== nil) {
                    return document.$apply_header_subs(val)
                    } else {
                    return val
                  }; return nil; })()))
                }}, TMP_17._s = self, TMP_17), $a).call($b);
              implicit_author = document.$attributes()['$[]']("author");
              implicit_authors = document.$attributes()['$[]']("authors");};
            metadata = author_metadata;};
          self.$process_attribute_entries(reader, document);
          rev_metadata = $hash2([], {});
          if (($a = ($c = reader['$has_more_lines?'](), $c !== false && $c !== nil ?($d = reader['$next_line_empty?'](), ($d === nil || $d === false)) : $c)) !== false && $a !== nil) {
            rev_line = reader.$read_line();
            if (($a = match = rev_line.$match($opalScope.REGEXP['$[]']("revision_info"))) !== false && $a !== nil) {
              rev_metadata['$[]=']("revdate", match['$[]'](2).$strip());
              if (($a = match['$[]'](1)['$nil?']()) === false || $a === nil) {
                rev_metadata['$[]=']("revnumber", match['$[]'](1).$rstrip())};
              if (($a = match['$[]'](3)['$nil?']()) === false || $a === nil) {
                rev_metadata['$[]=']("revremark", match['$[]'](3).$rstrip())};
              } else {
              reader.$unshift_line(rev_line)
            };};
          if (($a = rev_metadata['$empty?']()) === false || $a === nil) {
            if (($a = ($c = document['$nil?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
              ($a = ($c = rev_metadata).$each, $a._p = (TMP_18 = function(key, val){var self = TMP_18._s || this, $a;if (key == null) key = nil;if (val == null) val = nil;
              if (($a = document.$attributes()['$has_key?'](key)) !== false && $a !== nil) {
                  return nil
                  } else {
                  return document.$attributes()['$[]='](key, document.$apply_header_subs(val))
                }}, TMP_18._s = self, TMP_18), $a).call($c)};
            metadata.$update(rev_metadata);};
          self.$process_attribute_entries(reader, document);
          reader.$skip_blank_lines();};
        if (($a = ($d = document['$nil?'](), ($d === nil || $d === false))) !== false && $a !== nil) {
          author_metadata = nil;
          if (($a = ($d = document.$attributes()['$has_key?']("author"), $d !== false && $d !== nil ?($e = ((author_line = document.$attributes()['$[]']("author")))['$=='](implicit_author), ($e === nil || $e === false)) : $d)) !== false && $a !== nil) {
            author_metadata = self.$process_authors(author_line, true, false)
          } else if (($a = ($d = document.$attributes()['$has_key?']("authors"), $d !== false && $d !== nil ?($e = ((author_line = document.$attributes()['$[]']("authors")))['$=='](implicit_authors), ($e === nil || $e === false)) : $d)) !== false && $a !== nil) {
            author_metadata = self.$process_authors(author_line, true)
            } else {
            authors = [];
            author_key = "author_" + (authors.$size()['$+'](1));
            while (($d = document.$attributes()['$has_key?'](author_key)) !== false && $d !== nil) {
            authors['$<<'](document.$attributes()['$[]'](author_key));
            author_key = "author_" + (authors.$size()['$+'](1));};
            if (authors.$size()['$=='](1)) {
              author_metadata = self.$process_authors(authors.$first(), true, false)
            } else if (authors.$size()['$>'](1)) {
              author_metadata = self.$process_authors(authors.$join("; "), true)};
          };
          if (($a = author_metadata['$nil?']()) === false || $a === nil) {
            document.$attributes().$update(author_metadata);
            if (($a = ($d = ($e = document.$attributes()['$has_key?']("email"), ($e === nil || $e === false)), $d !== false && $d !== nil ?document.$attributes()['$has_key?']("email_1") : $d)) !== false && $a !== nil) {
              document.$attributes()['$[]=']("email", document.$attributes()['$[]']("email_1"))};};};
        return metadata;
      });

      $opal.defs(self, '$process_authors', function(author_line, names_only, multiple) {
        var $a, $b, $c, TMP_19, self = this, author_metadata = nil, keys = nil, author_entries = nil;
        if (names_only == null) {
          names_only = false
        }
        if (multiple == null) {
          multiple = true
        }
        author_metadata = $hash2([], {});
        keys = ["author", "authorinitials", "firstname", "middlename", "lastname", "email"];
        author_entries = (function() {if (multiple !== false && multiple !== nil) {
          return ($a = ($b = (author_line.$split(";"))).$map, $a._p = "strip".$to_proc(), $a).call($b)
          } else {
          return [author_line]
        }; return nil; })();
        ($a = ($c = author_entries).$each_with_index, $a._p = (TMP_19 = function(author_entry, idx){var self = TMP_19._s || this, $a, $b, TMP_20, $c, TMP_21, $d, $e, TMP_22, key_map = nil, segments = nil, match = nil, fname = nil, mname = nil, lname = nil;if (author_entry == null) author_entry = nil;if (idx == null) idx = nil;
        if (($a = author_entry['$empty?']()) !== false && $a !== nil) {
            return nil;};
          key_map = $hash2([], {});
          if (($a = idx['$zero?']()) !== false && $a !== nil) {
            ($a = ($b = keys).$each, $a._p = (TMP_20 = function(key){var self = TMP_20._s || this;if (key == null) key = nil;
            return key_map['$[]='](key.$to_sym(), key)}, TMP_20._s = self, TMP_20), $a).call($b)
            } else {
            ($a = ($c = keys).$each, $a._p = (TMP_21 = function(key){var self = TMP_21._s || this;if (key == null) key = nil;
            return key_map['$[]='](key.$to_sym(), "" + (key) + "_" + (idx['$+'](1)))}, TMP_21._s = self, TMP_21), $a).call($c)
          };
          segments = nil;
          if (names_only !== false && names_only !== nil) {
            segments = author_entry.$split(" ", 3)
          } else if (($a = (match = author_entry.$match($opalScope.REGEXP['$[]']("author_info")))) !== false && $a !== nil) {
            segments = match.$to_a();
            segments.$shift();};
          if (($a = segments['$nil?']()) !== false && $a !== nil) {
            author_metadata['$[]='](key_map['$[]']("author"), author_metadata['$[]='](key_map['$[]']("firstname"), fname = author_entry.$strip().$tr_s(" ", " ")));
            author_metadata['$[]='](key_map['$[]']("authorinitials"), fname['$[]'](0, 1));
            } else {
            author_metadata['$[]='](key_map['$[]']("firstname"), fname = segments['$[]'](0).$tr("_", " "));
            author_metadata['$[]='](key_map['$[]']("author"), fname);
            author_metadata['$[]='](key_map['$[]']("authorinitials"), fname['$[]'](0, 1));
            if (($a = ($d = ($e = segments['$[]'](1)['$nil?'](), ($e === nil || $e === false)), $d !== false && $d !== nil ?($e = segments['$[]'](2)['$nil?'](), ($e === nil || $e === false)) : $d)) !== false && $a !== nil) {
              author_metadata['$[]='](key_map['$[]']("middlename"), mname = segments['$[]'](1).$tr("_", " "));
              author_metadata['$[]='](key_map['$[]']("lastname"), lname = segments['$[]'](2).$tr("_", " "));
              author_metadata['$[]='](key_map['$[]']("author"), [fname, mname, lname].$join(" "));
              author_metadata['$[]='](key_map['$[]']("authorinitials"), [fname['$[]'](0, 1), mname['$[]'](0, 1), lname['$[]'](0, 1)].$join());
            } else if (($a = ($d = segments['$[]'](1)['$nil?'](), ($d === nil || $d === false))) !== false && $a !== nil) {
              author_metadata['$[]='](key_map['$[]']("lastname"), lname = segments['$[]'](1).$tr("_", " "));
              author_metadata['$[]='](key_map['$[]']("author"), [fname, lname].$join(" "));
              author_metadata['$[]='](key_map['$[]']("authorinitials"), [fname['$[]'](0, 1), lname['$[]'](0, 1)].$join());};
            if (($a = ((($d = names_only) !== false && $d !== nil) ? $d : segments['$[]'](3)['$nil?']())) === false || $a === nil) {
              author_metadata['$[]='](key_map['$[]']("email"), segments['$[]'](3))};
          };
          author_metadata['$[]=']("authorcount", idx['$+'](1));
          if (idx['$=='](1)) {
            ($a = ($d = keys).$each, $a._p = (TMP_22 = function(key){var self = TMP_22._s || this, $a;if (key == null) key = nil;
            if (($a = author_metadata['$has_key?'](key)) !== false && $a !== nil) {
                return author_metadata['$[]=']("" + (key) + "_1", author_metadata['$[]'](key))
                } else {
                return nil
              }}, TMP_22._s = self, TMP_22), $a).call($d)};
          if (($a = idx['$zero?']()) !== false && $a !== nil) {
            return author_metadata['$[]=']("authors", author_metadata['$[]'](key_map['$[]']("author")))
            } else {
            return author_metadata['$[]=']("authors", "" + (author_metadata['$[]']("authors")) + ", " + (author_metadata['$[]'](key_map['$[]']("author"))))
          };}, TMP_19._s = self, TMP_19), $a).call($c);
        return author_metadata;
      });

      $opal.defs(self, '$parse_block_metadata_lines', function(reader, parent, attributes, options) {
        var $a, $b, self = this;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        if (options == null) {
          options = $hash2([], {})
        }
        while (($b = self.$parse_block_metadata_line(reader, parent, attributes, options)) !== false && $b !== nil) {
        reader.$advance();
        reader.$skip_blank_lines();};
        return attributes;
      });

      $opal.defs(self, '$parse_block_metadata_line', function(reader, parent, attributes, options) {
        var $a, $b, $c, self = this, next_line = nil, commentish = nil, match = nil, terminator = nil;
        if (options == null) {
          options = $hash2([], {})
        }
        if (($a = ($b = reader['$has_more_lines?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          return false};
        next_line = reader.$peek_line();
        if (($a = ($b = (commentish = next_line['$start_with?']("//")), $b !== false && $b !== nil ?(match = next_line.$match($opalScope.REGEXP['$[]']("comment_blk"))) : $b)) !== false && $a !== nil) {
          terminator = match['$[]'](0);
          reader.$read_lines_until($hash2(["skip_first_line", "preserve_last_line", "terminator", "skip_processing"], {"skip_first_line": true, "preserve_last_line": true, "terminator": terminator, "skip_processing": true}));
        } else if (($a = (($b = commentish !== false && commentish !== nil) ? next_line.$match($opalScope.REGEXP['$[]']("comment")) : $b)) === false || $a === nil) {
          if (($a = ($b = ($c = options['$[]']("text"), ($c === nil || $c === false)), $b !== false && $b !== nil ?(match = next_line.$match($opalScope.REGEXP['$[]']("attr_entry"))) : $b)) !== false && $a !== nil) {
            self.$process_attribute_entry(reader, parent, attributes, match)
          } else if (($a = match = next_line.$match($opalScope.REGEXP['$[]']("anchor"))) !== false && $a !== nil) {
            if (($a = match['$[]'](1)['$==']("")) === false || $a === nil) {
              attributes['$[]=']("id", match['$[]'](1));
              if (($a = match['$[]'](2)['$nil?']()) === false || $a === nil) {
                attributes['$[]=']("reftext", match['$[]'](2))};}
          } else if (($a = match = next_line.$match($opalScope.REGEXP['$[]']("blk_attr_list"))) !== false && $a !== nil) {
            parent.$document().$parse_attributes(match['$[]'](1), [], $hash2(["sub_input", "into"], {"sub_input": true, "into": attributes}))
          } else if (($a = ($b = ($c = options['$[]']("text"), ($c === nil || $c === false)), $b !== false && $b !== nil ?(match = next_line.$match($opalScope.REGEXP['$[]']("blk_title"))) : $b)) !== false && $a !== nil) {
            attributes['$[]=']("title", match['$[]'](1))
            } else {
            return false
          }};
        return true;
      });

      $opal.defs(self, '$process_attribute_entries', function(reader, parent, attributes) {
        var $a, $b, self = this;
        if (attributes == null) {
          attributes = nil
        }
        reader.$skip_comment_lines();
        while (($b = self.$process_attribute_entry(reader, parent, attributes)) !== false && $b !== nil) {
        reader.$advance();
        reader.$skip_comment_lines();};
      });

      $opal.defs(self, '$process_attribute_entry', function(reader, parent, attributes, match) {
        var $a, $b, self = this, name = nil, value = nil, next_line = nil;
        if (attributes == null) {
          attributes = nil
        }
        if (match == null) {
          match = nil
        }
        ((($a = match) !== false && $a !== nil) ? $a : match = (function() {if (($b = reader['$has_more_lines?']()) !== false && $b !== nil) {
          return reader.$peek_line().$match($opalScope.REGEXP['$[]']("attr_entry"))
          } else {
          return nil
        }; return nil; })());
        if (match !== false && match !== nil) {
          name = match['$[]'](1);
          value = (function() {if (($a = match['$[]'](2)['$nil?']()) !== false && $a !== nil) {
            return ""
            } else {
            return match['$[]'](2)
          }; return nil; })();
          if (($a = value['$end_with?']($opalScope.LINE_BREAK)) !== false && $a !== nil) {
            value = value.$chop().$rstrip();
            while (($b = reader.$advance()) !== false && $b !== nil) {
            next_line = reader.$peek_line().$strip();
            if (($b = next_line['$empty?']()) !== false && $b !== nil) {
              break;};
            if (($b = next_line['$end_with?']($opalScope.LINE_BREAK)) !== false && $b !== nil) {
              value = "" + (value) + " " + (next_line.$chop().$rstrip())
              } else {
              value = "" + (value) + " " + (next_line);
              break;;
            };};};
          self.$store_attribute(name, value, (function() {if (($a = parent['$nil?']()) !== false && $a !== nil) {
            return nil
            } else {
            return parent.$document()
          }; return nil; })(), attributes);
          return true;
          } else {
          return false
        };
      });

      $opal.defs(self, '$store_attribute', function(name, value, doc, attrs) {
        var $a, $b, $c, self = this, accessible = nil;
        if (doc == null) {
          doc = nil
        }
        if (attrs == null) {
          attrs = nil
        }
        if (($a = name['$end_with?']("!")) !== false && $a !== nil) {
          value = nil;
          name = name.$chop();
        } else if (($a = name['$start_with?']("!")) !== false && $a !== nil) {
          value = nil;
          name = name['$[]']($range(1, -1, false));};
        name = self.$sanitize_attribute_name(name);
        accessible = true;
        if (($a = doc['$nil?']()) === false || $a === nil) {
          accessible = (function() {if (($a = value['$nil?']()) !== false && $a !== nil) {
            return doc.$delete_attribute(name)
            } else {
            return doc.$set_attribute(name, value)
          }; return nil; })()};
        if (($a = ((($b = ($c = accessible, ($c === nil || $c === false))) !== false && $b !== nil) ? $b : attrs['$nil?']())) === false || $a === nil) {
          ($opalScope.Document)._scope.AttributeEntry.$new(name, value).$save_to(attrs)};
        return [name, value];
      });

      $opal.defs(self, '$resolve_list_marker', function(list_type, marker, ordinal, validate, reader) {
        var $a, $b, $c, self = this;
        if (ordinal == null) {
          ordinal = 0
        }
        if (validate == null) {
          validate = false
        }
        if (reader == null) {
          reader = nil
        }
        if (($a = (($b = list_type['$==']("olist")) ? ($c = marker['$start_with?']("."), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          return self.$resolve_ordered_list_marker(marker, ordinal, validate, reader)
        } else if (list_type['$==']("colist")) {
          return "<1>"
          } else {
          return marker
        };
      });

      $opal.defs(self, '$resolve_ordered_list_marker', function(marker, ordinal, validate, reader) {
        var $a, $b, TMP_23, $c, $d, self = this, number_style = nil, expected = nil, actual = nil, $case = nil;
        if (ordinal == null) {
          ordinal = 0
        }
        if (validate == null) {
          validate = false
        }
        if (reader == null) {
          reader = nil
        }
        number_style = ($a = ($b = $opalScope.ORDERED_LIST_STYLES).$detect, $a._p = (TMP_23 = function(s){var self = TMP_23._s || this;if (s == null) s = nil;
        return marker.$match($opalScope.ORDERED_LIST_MARKER_PATTERNS['$[]'](s))}, TMP_23._s = self, TMP_23), $a).call($b);
        expected = actual = nil;
        $case = number_style;if ("arabic"['$===']($case)) {if (validate !== false && validate !== nil) {
          expected = ordinal['$+'](1);
          actual = marker.$to_i();};
        marker = "1.";}else if ("loweralpha"['$===']($case)) {if (validate !== false && validate !== nil) {
          expected = ("a"['$[]'](0).$ord()['$+'](ordinal)).$chr();
          actual = marker.$chomp(".");};
        marker = "a.";}else if ("upperalpha"['$===']($case)) {if (validate !== false && validate !== nil) {
          expected = ("A"['$[]'](0).$ord()['$+'](ordinal)).$chr();
          actual = marker.$chomp(".");};
        marker = "A.";}else if ("lowerroman"['$===']($case)) {if (validate !== false && validate !== nil) {
          expected = ordinal['$+'](1);
          actual = self.$roman_numeral_to_int(marker.$chomp(")"));};
        marker = "i)";}else if ("upperroman"['$===']($case)) {if (validate !== false && validate !== nil) {
          expected = ordinal['$+'](1);
          actual = self.$roman_numeral_to_int(marker.$chomp(")"));};
        marker = "I)";};
        if (($a = (($c = validate !== false && validate !== nil) ? ($d = expected['$=='](actual), ($d === nil || $d === false)) : $c)) !== false && $a !== nil) {
          self.$warn("asciidoctor: WARNING: " + (reader.$line_info()) + ": list item index: expected " + (expected) + ", got " + (actual))};
        return marker;
      });

      $opal.defs(self, '$is_sibling_list_item?', function(line, list_type, sibling_trait) {
        var $a, self = this, matcher = nil, expected_marker = nil, m = nil;
        if (($a = sibling_trait['$is_a?']($opalScope.Regexp)) !== false && $a !== nil) {
          matcher = sibling_trait;
          expected_marker = false;
          } else {
          matcher = $opalScope.REGEXP['$[]'](list_type);
          expected_marker = sibling_trait;
        };
        if (($a = m = line.$match(matcher)) !== false && $a !== nil) {
          if (expected_marker !== false && expected_marker !== nil) {
            return expected_marker['$=='](self.$resolve_list_marker(list_type, m['$[]'](1)))
            } else {
            return true
          }
          } else {
          return false
        };
      });

      $opal.defs(self, '$next_table', function(table_reader, parent, attributes) {
        var $a, $b, $c, $d, $e, $f, TMP_24, self = this, table = nil, explicit_col_specs = nil, skipped = nil, parser_ctx = nil, loop_idx = nil, line = nil, next_line = nil, next_cell_spec = nil, seen = nil, m = nil, cell_text = nil, even_width = nil;
        table = $opalScope.Table.$new(parent, attributes);
        if (($a = attributes['$has_key?']("title")) !== false && $a !== nil) {
          table['$title='](attributes.$delete("title"))};
        table.$assign_caption(attributes.$delete("caption"));
        if (($a = attributes['$has_key?']("cols")) !== false && $a !== nil) {
          table.$create_columns(self.$parse_col_specs(attributes['$[]']("cols")));
          explicit_col_specs = true;
          } else {
          explicit_col_specs = false
        };
        skipped = table_reader.$skip_blank_lines();
        parser_ctx = ($opalScope.Table)._scope.ParserContext.$new(table_reader, table, attributes);
        loop_idx = -1;
        while (($b = table_reader['$has_more_lines?']()) !== false && $b !== nil) {
        loop_idx = loop_idx['$+'](1);
        line = table_reader.$read_line();
        if (($b = ($c = ($d = ($e = (($f = skipped['$=='](0)) ? loop_idx['$zero?']() : $f), $e !== false && $e !== nil ?($f = attributes['$has_key?']("options"), ($f === nil || $f === false)) : $e), $d !== false && $d !== nil ?($e = ((next_line = table_reader.$peek_line()))['$nil?'](), ($e === nil || $e === false)) : $d), $c !== false && $c !== nil ?next_line['$empty?']() : $c)) !== false && $b !== nil) {
          table['$has_header_option='](true);
          table.$set_option("header");};
        if (parser_ctx.$format()['$==']("psv")) {
          if (($b = parser_ctx['$starts_with_delimiter?'](line)) !== false && $b !== nil) {
            line = line['$[]']($range(1, -1, false));
            parser_ctx.$close_open_cell();
            } else {
            $b = $opal.to_ary(self.$parse_cell_spec(line, "start")), next_cell_spec = ($b[0] == null ? nil : $b[0]), line = ($b[1] == null ? nil : $b[1]);
            if (($b = ($c = next_cell_spec['$nil?'](), ($c === nil || $c === false))) !== false && $b !== nil) {
              parser_ctx.$close_open_cell(next_cell_spec)};
          }};
        seen = false;
        while (($c = ((($d = ($e = seen, ($e === nil || $e === false))) !== false && $d !== nil) ? $d : ($e = line['$empty?'](), ($e === nil || $e === false)))) !== false && $c !== nil) {
        seen = true;
        if (($c = m = parser_ctx.$match_delimiter(line)) !== false && $c !== nil) {
          if (parser_ctx.$format()['$==']("csv")) {
            if (($c = parser_ctx['$buffer_has_unclosed_quotes?'](m.$pre_match())) !== false && $c !== nil) {
              line = parser_ctx.$skip_matched_delimiter(m);
              continue;;}
          } else if (($c = m.$pre_match()['$end_with?']("\\")) !== false && $c !== nil) {
            line = parser_ctx.$skip_matched_delimiter(m, true);
            continue;;};
          if (parser_ctx.$format()['$==']("psv")) {
            $c = $opal.to_ary(self.$parse_cell_spec(m.$pre_match(), "end")), next_cell_spec = ($c[0] == null ? nil : $c[0]), cell_text = ($c[1] == null ? nil : $c[1]);
            parser_ctx.$push_cell_spec(next_cell_spec);
            parser_ctx['$buffer=']("" + (parser_ctx.$buffer()) + (cell_text));
            } else {
            parser_ctx['$buffer=']("" + (parser_ctx.$buffer()) + (m.$pre_match()))
          };
          line = m.$post_match();
          parser_ctx.$close_cell();
          } else {
          parser_ctx['$buffer=']("" + (parser_ctx.$buffer()) + (line) + ($opalScope.EOL));
          if (parser_ctx.$format()['$==']("csv")) {
            parser_ctx['$buffer=']("" + (parser_ctx.$buffer().$rstrip()) + " ")};
          line = "";
          if (($c = ((($d = parser_ctx.$format()['$==']("psv")) !== false && $d !== nil) ? $d : ((($e = parser_ctx.$format()['$==']("csv")) ? parser_ctx['$buffer_has_unclosed_quotes?']() : $e)))) !== false && $c !== nil) {
            parser_ctx.$keep_cell_open()
            } else {
            parser_ctx.$close_cell(true)
          };
        };};
        if (($b = parser_ctx['$cell_open?']()) === false || $b === nil) {
          skipped = table_reader.$skip_blank_lines()};
        if (($b = ($c = table_reader['$has_more_lines?'](), ($c === nil || $c === false))) !== false && $b !== nil) {
          parser_ctx.$close_cell(true)};};
        ($a = "colcount", $b = table.$attributes(), ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, parser_ctx.$col_count())));
        if (($a = ($b = explicit_col_specs, ($b === nil || $b === false))) !== false && $a !== nil) {
          even_width = ((100.0)['$/'](parser_ctx.$col_count())).$floor();
          ($a = ($b = table.$columns()).$each, $a._p = (TMP_24 = function(c){var self = TMP_24._s || this;if (c == null) c = nil;
          return c.$assign_width(0, even_width)}, TMP_24._s = self, TMP_24), $a).call($b);};
        table.$partition_header_footer(attributes);
        return table;
      });

      $opal.defs(self, '$parse_col_specs', function(records) {
        var $a, $b, TMP_25, $c, TMP_26, self = this, specs = nil, m = nil;
        specs = [];
        if (($a = m = records.$match($opalScope.REGEXP['$[]']("digits"))) !== false && $a !== nil) {
          ($a = ($b = (1)).$upto, $a._p = (TMP_25 = function(){var self = TMP_25._s || this;
          return specs['$<<']($hash2(["width"], {"width": 1}))}, TMP_25._s = self, TMP_25), $a).call($b, m['$[]'](0).$to_i());
          return specs;};
        ($a = ($c = records.$split(",")).$each, $a._p = (TMP_26 = function(record){var self = TMP_26._s || this, $a, $b, $c, TMP_27, spec = nil, colspec = nil, rowspec = nil, repeat = nil;if (record == null) record = nil;
        if (($a = m = record.$match($opalScope.REGEXP['$[]']("table_colspec"))) !== false && $a !== nil) {
            spec = $hash2([], {});
            if (($a = m['$[]'](2)) !== false && $a !== nil) {
              $a = $opal.to_ary(m['$[]'](2).$split(".")), colspec = ($a[0] == null ? nil : $a[0]), rowspec = ($a[1] == null ? nil : $a[1]);
              if (($a = ($b = ($c = colspec.$to_s()['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($opalScope.Table)._scope.ALIGNMENTS['$[]']("h")['$has_key?'](colspec) : $b)) !== false && $a !== nil) {
                spec['$[]=']("halign", ($opalScope.Table)._scope.ALIGNMENTS['$[]']("h")['$[]'](colspec))};
              if (($a = ($b = ($c = rowspec.$to_s()['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($opalScope.Table)._scope.ALIGNMENTS['$[]']("v")['$has_key?'](rowspec) : $b)) !== false && $a !== nil) {
                spec['$[]=']("valign", ($opalScope.Table)._scope.ALIGNMENTS['$[]']("v")['$[]'](rowspec))};};
            spec['$[]=']("width", (function() {if (($a = ($b = m['$[]'](3)['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              return m['$[]'](3).$to_i()
              } else {
              return 1
            }; return nil; })());
            if (($a = ($b = m['$[]'](4), $b !== false && $b !== nil ?($opalScope.Table)._scope.TEXT_STYLES['$has_key?'](m['$[]'](4)) : $b)) !== false && $a !== nil) {
              spec['$[]=']("style", ($opalScope.Table)._scope.TEXT_STYLES['$[]'](m['$[]'](4)))};
            repeat = (function() {if (($a = ($b = m['$[]'](1)['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              return m['$[]'](1).$to_i()
              } else {
              return 1
            }; return nil; })();
            return ($a = ($b = (1)).$upto, $a._p = (TMP_27 = function(){var self = TMP_27._s || this;
            return specs['$<<'](spec.$dup())}, TMP_27._s = self, TMP_27), $a).call($b, repeat);
            } else {
            return nil
          }}, TMP_26._s = self, TMP_26), $a).call($c);
        return specs;
      });

      $opal.defs(self, '$parse_cell_spec', function(line, pos) {
        var $a, $b, $c, self = this, spec = nil, rest = nil, m = nil, colspec = nil, rowspec = nil;
        if (pos == null) {
          pos = "start"
        }
        spec = ((function() {if (pos['$==']("end")) {
          return $hash2([], {})
          } else {
          return nil
        }; return nil; })());
        rest = line;
        if (($a = m = line.$match($opalScope.REGEXP['$[]']("table_cellspec")['$[]'](pos))) !== false && $a !== nil) {
          spec = $hash2([], {});
          if (($a = m['$[]'](0)['$empty?']()) !== false && $a !== nil) {
            return [spec, line]};
          rest = ((function() {if (pos['$==']("start")) {
            return m.$post_match()
            } else {
            return m.$pre_match()
          }; return nil; })());
          if (($a = m['$[]'](1)) !== false && $a !== nil) {
            $a = $opal.to_ary(m['$[]'](1).$split(".")), colspec = ($a[0] == null ? nil : $a[0]), rowspec = ($a[1] == null ? nil : $a[1]);
            colspec = (function() {if (($a = colspec.$to_s()['$empty?']()) !== false && $a !== nil) {
              return 1
              } else {
              return colspec.$to_i()
            }; return nil; })();
            rowspec = (function() {if (($a = rowspec.$to_s()['$empty?']()) !== false && $a !== nil) {
              return 1
              } else {
              return rowspec.$to_i()
            }; return nil; })();
            if (m['$[]'](2)['$==']("+")) {
              if (($a = colspec['$=='](1)) === false || $a === nil) {
                spec['$[]=']("colspan", colspec)};
              if (($a = rowspec['$=='](1)) === false || $a === nil) {
                spec['$[]=']("rowspan", rowspec)};
            } else if (m['$[]'](2)['$==']("*")) {
              if (($a = colspec['$=='](1)) === false || $a === nil) {
                spec['$[]=']("repeatcol", colspec)}};};
          if (($a = m['$[]'](3)) !== false && $a !== nil) {
            $a = $opal.to_ary(m['$[]'](3).$split(".")), colspec = ($a[0] == null ? nil : $a[0]), rowspec = ($a[1] == null ? nil : $a[1]);
            if (($a = ($b = ($c = colspec.$to_s()['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($opalScope.Table)._scope.ALIGNMENTS['$[]']("h")['$has_key?'](colspec) : $b)) !== false && $a !== nil) {
              spec['$[]=']("halign", ($opalScope.Table)._scope.ALIGNMENTS['$[]']("h")['$[]'](colspec))};
            if (($a = ($b = ($c = rowspec.$to_s()['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?($opalScope.Table)._scope.ALIGNMENTS['$[]']("v")['$has_key?'](rowspec) : $b)) !== false && $a !== nil) {
              spec['$[]=']("valign", ($opalScope.Table)._scope.ALIGNMENTS['$[]']("v")['$[]'](rowspec))};};
          if (($a = ($b = m['$[]'](4), $b !== false && $b !== nil ?($opalScope.Table)._scope.TEXT_STYLES['$has_key?'](m['$[]'](4)) : $b)) !== false && $a !== nil) {
            spec['$[]=']("style", ($opalScope.Table)._scope.TEXT_STYLES['$[]'](m['$[]'](4)))};};
        return [spec, rest];
      });

      $opal.defs(self, '$parse_style_attribute', function(attributes, reader) {
        var $a, $b, $c, TMP_28, TMP_29, $d, TMP_30, self = this, original_style = nil, raw_style = nil, type = nil, collector = nil, parsed = nil, save_current = nil, parsed_style = nil, options = nil, existing_opts = nil;
        if (reader == null) {
          reader = nil
        }
        original_style = attributes['$[]']("style");
        raw_style = attributes['$[]'](1);
        if (($a = ((($b = ($c = raw_style, ($c === nil || $c === false))) !== false && $b !== nil) ? $b : raw_style['$include?'](" "))) !== false && $a !== nil) {
          attributes['$[]=']("style", raw_style);
          return [raw_style, original_style];
          } else {
          type = "style";
          collector = [];
          parsed = $hash2([], {});
          save_current = ($a = ($b = self).$lambda, $a._p = (TMP_28 = function(){var self = TMP_28._s || this, $a, $b, $c, $case = nil;
          if (($a = collector['$empty?']()) !== false && $a !== nil) {
              if (($a = ($b = type['$==']("style"), ($b === nil || $b === false))) !== false && $a !== nil) {
                return self.$warn("asciidoctor: WARNING:" + ((function() {if (($a = reader['$nil?']()) !== false && $a !== nil) {
                  return nil
                  } else {
                  return " " + (reader.$prev_line_info()) + ":"
                }; return nil; })()) + " invalid empty " + (type) + " detected in style attribute")
                } else {
                return nil
              }
              } else {
              $case = type;if ("role"['$===']($case) || "option"['$===']($case)) {($a = type, $b = parsed, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, [])));
              parsed['$[]'](type).$push(collector.$join());}else if ("id"['$===']($case)) {if (($a = parsed['$has_key?']("id")) !== false && $a !== nil) {
                self.$warn("asciidoctor: WARNING:" + ((function() {if (($a = reader['$nil?']()) !== false && $a !== nil) {
                  return nil
                  } else {
                  return " " + (reader.$prev_line_info()) + ":"
                }; return nil; })()) + " multiple ids detected in style attribute")};
              parsed['$[]='](type, collector.$join());}else {parsed['$[]='](type, collector.$join())};
              return collector = [];
            }}, TMP_28._s = self, TMP_28), $a).call($b);
          ($a = ($c = raw_style).$each_char, $a._p = (TMP_29 = function(c){var self = TMP_29._s || this, $a, $b, $c, $case = nil;if (c == null) c = nil;
          if (($a = ((($b = ((($c = c['$=='](".")) !== false && $c !== nil) ? $c : c['$==']("#"))) !== false && $b !== nil) ? $b : c['$==']("%"))) !== false && $a !== nil) {
              save_current.$call();
              return (function() {$case = c;if ("."['$===']($case)) {return type = "role"}else if ("#"['$===']($case)) {return type = "id"}else if ("%"['$===']($case)) {return type = "option"}else { return nil }})();
              } else {
              return collector.$push(c)
            }}, TMP_29._s = self, TMP_29), $a).call($c);
          if (type['$==']("style")) {
            parsed_style = attributes['$[]=']("style", raw_style)
            } else {
            save_current.$call();
            if (($a = parsed['$has_key?']("style")) !== false && $a !== nil) {
              parsed_style = attributes['$[]=']("style", parsed['$[]']("style"))
              } else {
              parsed_style = nil
            };
            if (($a = parsed['$has_key?']("id")) !== false && $a !== nil) {
              attributes['$[]=']("id", parsed['$[]']("id"))};
            if (($a = parsed['$has_key?']("role")) !== false && $a !== nil) {
              attributes['$[]=']("role", parsed['$[]']("role")['$*'](" "))};
            if (($a = parsed['$has_key?']("option")) !== false && $a !== nil) {
              ($a = ($d = ((options = parsed['$[]']("option")))).$each, $a._p = (TMP_30 = function(option){var self = TMP_30._s || this;if (option == null) option = nil;
              return attributes['$[]=']("" + (option) + "-option", "")}, TMP_30._s = self, TMP_30), $a).call($d);
              if (($a = (existing_opts = attributes['$[]']("options"))) !== false && $a !== nil) {
                attributes['$[]=']("options", (options['$+'](existing_opts.$split(",")))['$*'](","))
                } else {
                attributes['$[]=']("options", options['$*'](","))
              };};
          };
          return [parsed_style, original_style];
        };
      });

      $opal.defs(self, '$reset_block_indent!', function(lines, indent) {
        var $a, $b, TMP_31, $c, TMP_32, $d, TMP_33, self = this, tab_detected = nil, tab_expansion = nil, offsets = nil, offset = nil, padding = nil;
        if (indent == null) {
          indent = 0
        }
        if (($a = ((($b = indent['$nil?']()) !== false && $b !== nil) ? $b : lines['$empty?']())) !== false && $a !== nil) {
          return nil};
        tab_detected = false;
        tab_expansion = "    ";
        offsets = ($a = ($b = lines).$map, $a._p = (TMP_31 = function(line){var self = TMP_31._s || this, $a, flush_line = nil, offset = nil;if (line == null) line = nil;
        if (($a = line['$[]']($range(0, 0, false)).$lstrip()['$empty?']()) === false || $a === nil) {
            return ($breaker.$v = [], $breaker)};
          if (($a = line['$include?']("\t")) !== false && $a !== nil) {
            tab_detected = true;
            line = line.$gsub("\t", tab_expansion);};
          if (($a = ((flush_line = line.$lstrip()))['$empty?']()) !== false && $a !== nil) {
            return nil
          } else if (((offset = line.$length()['$-'](flush_line.$length())))['$=='](0)) {
            return ($breaker.$v = [], $breaker)
            } else {
            return offset
          };}, TMP_31._s = self, TMP_31), $a).call($b);
        if (($a = ((($c = offsets['$empty?']()) !== false && $c !== nil) ? $c : ((offsets = offsets.$compact()))['$empty?']())) === false || $a === nil) {
          if (((offset = offsets.$min()))['$>'](0)) {
            ($a = ($c = lines)['$map!'], $a._p = (TMP_32 = function(line){var self = TMP_32._s || this;if (line == null) line = nil;
            if (tab_detected !== false && tab_detected !== nil) {
                line = line.$gsub("\t", tab_expansion)};
              return line['$[]']($range(offset, -1, false)).$to_s();}, TMP_32._s = self, TMP_32), $a).call($c)}};
        if (indent['$>'](0)) {
          padding = " "['$*'](indent);
          ($a = ($d = lines)['$map!'], $a._p = (TMP_33 = function(line){var self = TMP_33._s || this;if (line == null) line = nil;
          return "" + (padding) + (line)}, TMP_33._s = self, TMP_33), $a).call($d);};
        return nil;
      });

      $opal.defs(self, '$sanitize_attribute_name', function(name) {
        var self = this;
        return name.$gsub($opalScope.REGEXP['$[]']("illegal_attr_name_chars"), "").$downcase();
      });

      return ($opal.defs(self, '$roman_numeral_to_int', function(value) {
        var $a, $b, TMP_34, self = this, digits = nil, result = nil;
        value = value.$downcase();
        digits = $hash2(["i", "v", "x"], {"i": 1, "v": 5, "x": 10});
        result = 0;
        ($a = ($b = ($range(0, value.$length()['$-'](1), false))).$each, $a._p = (TMP_34 = function(i){var self = TMP_34._s || this, $a, $b, digit = nil;if (i == null) i = nil;
        digit = digits['$[]'](value['$[]']($range(i, i, false)));
          if (($a = (($b = i['$+'](1)['$<'](value.$length())) ? digits['$[]'](value['$[]']($range(i['$+'](1), i['$+'](1), false)))['$>'](digit) : $b)) !== false && $a !== nil) {
            return result = result['$-'](digit)
            } else {
            return result = result['$+'](digit)
          };}, TMP_34._s = self, TMP_34), $a).call($b);
        return result;
      }), nil);
    })(self, null)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $List(){};
      var self = $List = $klass($base, $super, 'List', $List);

      var def = $List._proto, $opalScope = $List._scope, TMP_1, TMP_2;
      def.blocks = def.context = def.document = nil;
      $opal.defn(self, '$items', def.$blocks);

      $opal.defn(self, '$items?', def['$blocks?']);

      def.$initialize = TMP_1 = function(parent, context) {
        var self = this, $iter = TMP_1._p, $yield = $iter || nil;
        TMP_1._p = null;
        return $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, context]);
      };

      def.$content = function() {
        var self = this;
        return self.blocks;
      };

      return (def.$render = TMP_2 = function() {var $zuper = $slice.call(arguments, 0);
        var self = this, $iter = TMP_2._p, $yield = $iter || nil, result = nil;
        TMP_2._p = null;
        result = $opal.find_super_dispatcher(self, 'render', TMP_2, $iter).apply(self, $zuper);
        if (self.context['$==']("colist")) {
          self.document.$callouts().$next_list()};
        return result;
      }, nil);
    })(self, $opalScope.AbstractBlock);

    (function($base, $super) {
      function $ListItem(){};
      var self = $ListItem = $klass($base, $super, 'ListItem', $ListItem);

      var def = $ListItem._proto, $opalScope = $ListItem._scope, TMP_3;
      def.text = def.blocks = def.context = nil;
      self.$attr_accessor("marker");

      def.$initialize = TMP_3 = function(parent, text) {
        var self = this, $iter = TMP_3._p, $yield = $iter || nil;
        if (text == null) {
          text = nil
        }
        TMP_3._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_3, null).apply(self, [parent, "list_item"]);
        self.text = text;
        return self.level = parent.$level();
      };

      def['$text?'] = function() {
        var $a, self = this;
        return ($a = self.text.$to_s()['$empty?'](), ($a === nil || $a === false));
      };

      def.$text = function() {
        var self = this;
        return self.$apply_subs(self.text);
      };

      def.$fold_first = function(continuation_connects_first_block, content_adjacent) {
        var $a, $b, $c, $d, $e, $f, $g, self = this, first_block = nil, block = nil;
        if (continuation_connects_first_block == null) {
          continuation_connects_first_block = false
        }
        if (content_adjacent == null) {
          content_adjacent = false
        }
        if (($a = ($b = ($c = ($d = ((first_block = self.blocks.$first()))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?first_block['$is_a?']($opalScope.Block) : $c), $b !== false && $b !== nil ?(((($c = ((($d = first_block.$context()['$==']("paragraph")) ? ($e = continuation_connects_first_block, ($e === nil || $e === false)) : $d))) !== false && $c !== nil) ? $c : (($d = ($e = (((($f = content_adjacent) !== false && $f !== nil) ? $f : ($g = continuation_connects_first_block, ($g === nil || $g === false)))), $e !== false && $e !== nil ?first_block.$context()['$==']("literal") : $e), $d !== false && $d !== nil ?first_block['$option?']("listparagraph") : $d)))) : $b)) !== false && $a !== nil) {
          block = self.$blocks().$shift();
          if (($a = self.text.$to_s()['$empty?']()) === false || $a === nil) {
            block.$lines().$unshift(self.text)};
          self.text = block.$source();};
        return nil;
      };

      return (def.$to_s = function() {
        var $a, self = this;
        return "" + (self.context) + " [text:" + (self.text) + ", blocks:" + ((((($a = self.blocks) !== false && $a !== nil) ? $a : [])).$size()) + "]";
      }, nil);
    })(self, $opalScope.AbstractBlock);
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $gvars = $opal.gvars, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $PathResolver(){};
      var self = $PathResolver = $klass($base, $super, 'PathResolver', $PathResolver);

      var def = $PathResolver._proto, $opalScope = $PathResolver._scope;
      def.file_separator = def.working_dir = nil;
      $opal.cdecl($opalScope, 'DOT', ".");

      $opal.cdecl($opalScope, 'DOT_DOT', "..");

      $opal.cdecl($opalScope, 'SLASH', "/");

      $opal.cdecl($opalScope, 'BACKSLASH', "\\");

      $opal.cdecl($opalScope, 'WIN_ROOT_RE', /^[a-zA-Z]:(?:\\|\/)/);

      self.$attr_accessor("file_separator");

      self.$attr_accessor("working_dir");

      def.$initialize = function(file_separator, working_dir) {
        var $a, self = this;
        if (file_separator == null) {
          file_separator = nil
        }
        if (working_dir == null) {
          working_dir = nil
        }
        self.file_separator = (function() {if (($a = file_separator['$nil?']()) !== false && $a !== nil) {
          return (((($a = ($opalScope.File)._scope.ALT_SEPARATOR) !== false && $a !== nil) ? $a : ($opalScope.File)._scope.SEPARATOR))
          } else {
          return file_separator
        }; return nil; })();
        if (($a = working_dir['$nil?']()) !== false && $a !== nil) {
          return self.working_dir = $opalScope.File.$expand_path($opalScope.Dir.$pwd())
          } else {
          return self.working_dir = (function() {if (($a = self['$is_root?'](working_dir)) !== false && $a !== nil) {
            return working_dir
            } else {
            return $opalScope.File.$expand_path(working_dir)
          }; return nil; })()
        };
      };

      def['$is_root?'] = function(path) {
        var $a, $b, self = this;
        if (($a = (($b = self.file_separator['$==']($opalScope.BACKSLASH)) ? path.$match($opalScope.WIN_ROOT_RE) : $b)) !== false && $a !== nil) {
          return true
        } else if (($a = path['$start_with?']($opalScope.SLASH)) !== false && $a !== nil) {
          return true
          } else {
          return false
        };
      };

      def['$is_web_root?'] = function(path) {
        var self = this;
        return path['$start_with?']($opalScope.SLASH);
      };

      def.$posixfy = function(path) {
        var $a, self = this;
        if (($a = path.$to_s()['$empty?']()) !== false && $a !== nil) {
          return ""};
        if (($a = path['$include?']($opalScope.BACKSLASH)) !== false && $a !== nil) {
          return path.$tr($opalScope.BACKSLASH, $opalScope.SLASH)
          } else {
          return path
        };
      };

      def.$expand_path = function(path) {
        var $a, self = this, path_segments = nil, path_root = nil, _ = nil;
        $a = $opal.to_ary(self.$partition_path(path)), path_segments = ($a[0] == null ? nil : $a[0]), path_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
        return self.$join_path(path_segments, path_root);
      };

      def.$partition_path = function(path, web_path) {
        var self = this, posix_path = nil, is_root = nil, path_segments = nil, root = nil;
        if (web_path == null) {
          web_path = false
        }
        posix_path = self.$posixfy(path);
        is_root = (function() {if (web_path !== false && web_path !== nil) {
          return self['$is_web_root?'](posix_path)
          } else {
          return self['$is_root?'](posix_path)
        }; return nil; })();
        path_segments = posix_path.$tr_s($opalScope.SLASH, $opalScope.SLASH).$split($opalScope.SLASH);
        root = (function() {if (path_segments.$first()['$==']($opalScope.DOT)) {
          return $opalScope.DOT
          } else {
          return nil
        }; return nil; })();
        path_segments.$delete($opalScope.DOT);
        root = (function() {if (is_root !== false && is_root !== nil) {
          return path_segments.$shift()
          } else {
          return root
        }; return nil; })();
        return [path_segments, root, posix_path];
      };

      def.$join_path = function(segments, root) {
        var self = this;
        if (root == null) {
          root = nil
        }
        if (root !== false && root !== nil) {
          return "" + (root) + ($opalScope.SLASH) + (segments['$*']($opalScope.SLASH))
          } else {
          return segments['$*']($opalScope.SLASH)
        };
      };

      def.$system_path = function(target, start, jail, opts) {
        var $a, $b, $c, TMP_1, self = this, recover = nil, target_segments = nil, target_root = nil, _ = nil, resolved_target = nil, jail_segments = nil, jail_root = nil, start_segments = nil, start_root = nil, resolved_segments = nil, warned = nil;
        if (jail == null) {
          jail = nil
        }
        if (opts == null) {
          opts = $hash2([], {})
        }
        recover = opts.$fetch("recover", true);
        if (($a = jail['$nil?']()) === false || $a === nil) {
          if (($a = self['$is_root?'](jail)) === false || $a === nil) {
            self.$raise($opalScope.SecurityError, "Jail is not an absolute path: " + (jail))};
          jail = self.$posixfy(jail);};
        if (($a = target.$to_s()['$empty?']()) !== false && $a !== nil) {
          target_segments = []
          } else {
          $a = $opal.to_ary(self.$partition_path(target)), target_segments = ($a[0] == null ? nil : $a[0]), target_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2])
        };
        if (($a = target_segments['$empty?']()) !== false && $a !== nil) {
          if (($a = start.$to_s()['$empty?']()) !== false && $a !== nil) {
            return (function() {if (($a = jail['$nil?']()) !== false && $a !== nil) {
              return self.working_dir
              } else {
              return jail
            }; return nil; })()
          } else if (($a = self['$is_root?'](start)) !== false && $a !== nil) {
            if (($a = jail['$nil?']()) !== false && $a !== nil) {
              return self.$expand_path(start)}
            } else {
            return self.$system_path(start, jail, jail)
          }};
        if (($a = (($b = target_root !== false && target_root !== nil) ? ($c = target_root['$==']($opalScope.DOT), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          resolved_target = self.$join_path(target_segments, target_root);
          if (($a = ((($b = jail['$nil?']()) !== false && $b !== nil) ? $b : resolved_target['$start_with?'](jail))) !== false && $a !== nil) {
            return resolved_target};};
        if (($a = start.$to_s()['$empty?']()) !== false && $a !== nil) {
          start = (function() {if (($a = jail['$nil?']()) !== false && $a !== nil) {
            return self.working_dir
            } else {
            return jail
          }; return nil; })()
        } else if (($a = self['$is_root?'](start)) !== false && $a !== nil) {
          start = self.$posixfy(start)
          } else {
          start = self.$system_path(start, jail, jail)
        };
        if (jail['$=='](start)) {
          $a = $opal.to_ary(self.$partition_path(jail)), jail_segments = ($a[0] == null ? nil : $a[0]), jail_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
          start_segments = jail_segments.$dup();
        } else if (($a = ($b = jail['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          if (($a = ($b = start['$start_with?'](jail), ($b === nil || $b === false))) !== false && $a !== nil) {
            self.$raise($opalScope.SecurityError, "" + (((($a = opts['$[]']("target_name")) !== false && $a !== nil) ? $a : "Start path")) + " " + (start) + " is outside of jail: " + (jail) + " (disallowed in safe mode)")};
          $a = $opal.to_ary(self.$partition_path(start)), start_segments = ($a[0] == null ? nil : $a[0]), start_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
          $a = $opal.to_ary(self.$partition_path(jail)), jail_segments = ($a[0] == null ? nil : $a[0]), jail_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
          } else {
          $a = $opal.to_ary(self.$partition_path(start)), start_segments = ($a[0] == null ? nil : $a[0]), start_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
          jail_root = start_root;
        };
        resolved_segments = start_segments.$dup();
        warned = false;
        ($a = ($b = target_segments).$each, $a._p = (TMP_1 = function(segment){var self = TMP_1._s || this, $a, $b;if (segment == null) segment = nil;
        if (segment['$==']($opalScope.DOT_DOT)) {
            if (($a = ($b = jail['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
              if (resolved_segments.$length()['$>'](jail_segments.$length())) {
                return resolved_segments.$pop()
              } else if (($a = ($b = recover, ($b === nil || $b === false))) !== false && $a !== nil) {
                return self.$raise($opalScope.SecurityError, "" + (((($a = opts['$[]']("target_name")) !== false && $a !== nil) ? $a : "path")) + " " + (target) + " refers to location outside jail: " + (jail) + " (disallowed in safe mode)")
              } else if (($a = ($b = warned, ($b === nil || $b === false))) !== false && $a !== nil) {
                self.$warn("asciidoctor: WARNING: " + (((($a = opts['$[]']("target_name")) !== false && $a !== nil) ? $a : "path")) + " has illegal reference to ancestor of jail, auto-recovering");
                return warned = true;
                } else {
                return nil
              }
              } else {
              return resolved_segments.$pop()
            }
            } else {
            return resolved_segments.$push(segment)
          }}, TMP_1._s = self, TMP_1), $a).call($b);
        return self.$join_path(resolved_segments, jail_root);
      };

      def.$web_path = function(target, start) {
        var $a, $b, TMP_2, self = this, uri_prefix = nil, target_segments = nil, target_root = nil, _ = nil, resolved_segments = nil;
        if (start == null) {
          start = nil
        }
        target = self.$posixfy(target);
        start = self.$posixfy(start);
        uri_prefix = nil;
        if (($a = ((($b = self['$is_web_root?'](target)) !== false && $b !== nil) ? $b : start['$empty?']())) === false || $a === nil) {
          target = "" + (start) + ($opalScope.SLASH) + (target);
          if (($a = ($b = target['$include?'](":"), $b !== false && $b !== nil ?target.$match(($opalScope.Asciidoctor)._scope.REGEXP['$[]']("uri_sniff")) : $b)) !== false && $a !== nil) {
            uri_prefix = $gvars["~"]['$[]'](0);
            target = target['$[]']($range(uri_prefix.$length(), -1, false));};};
        $a = $opal.to_ary(self.$partition_path(target, true)), target_segments = ($a[0] == null ? nil : $a[0]), target_root = ($a[1] == null ? nil : $a[1]), _ = ($a[2] == null ? nil : $a[2]);
        resolved_segments = ($a = ($b = target_segments).$opalInject, $a._p = (TMP_2 = function(accum, segment){var self = TMP_2._s || this, $a, $b, $c;if (accum == null) accum = nil;if (segment == null) segment = nil;
        if (segment['$==']($opalScope.DOT_DOT)) {
            if (($a = accum['$empty?']()) !== false && $a !== nil) {
              if (($a = (($b = target_root !== false && target_root !== nil) ? ($c = target_root['$==']($opalScope.DOT), ($c === nil || $c === false)) : $b)) === false || $a === nil) {
                accum.$push(segment)}
            } else if (accum['$[]'](-1)['$==']($opalScope.DOT_DOT)) {
              accum.$push(segment)
              } else {
              accum.$pop()
            }
            } else {
            accum.$push(segment)
          };
          return accum;}, TMP_2._s = self, TMP_2), $a).call($b, []);
        if (($a = uri_prefix['$nil?']()) !== false && $a !== nil) {
          return self.$join_path(resolved_segments, target_root)
          } else {
          return "" + (uri_prefix) + (self.$join_path(resolved_segments, target_root))
        };
      };

      return (def.$relative_path = function(filename, base_directory) {
        var $a, $b, self = this, offset = nil;
        if (($a = ($b = (self['$is_root?'](filename)), $b !== false && $b !== nil ?(self['$is_root?'](base_directory)) : $b)) !== false && $a !== nil) {
          offset = base_directory.$chomp(self.file_separator).$length()['$+'](1);
          return filename['$[]']($range(offset, -1, false));
          } else {
          return filename
        };
      }, nil);
    })(self, null)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Reader(){};
      var self = $Reader = $klass($base, $super, 'Reader', $Reader);

      var def = $Reader._proto, $opalScope = $Reader._scope, TMP_4;
      def.file = def.dir = def.lines = def.process_lines = def.look_ahead = def.eof = def.unescape_next_line = def.lineno = def.path = def.source_lines = nil;
      (function($base, $super) {
        function $Cursor(){};
        var self = $Cursor = $klass($base, $super, 'Cursor', $Cursor);

        var def = $Cursor._proto, $opalScope = $Cursor._scope;
        self.$attr_accessor("file");

        self.$attr_accessor("dir");

        self.$attr_accessor("path");

        self.$attr_accessor("lineno");

        def.$initialize = function(file, dir, path, lineno) {
          var self = this;
          if (dir == null) {
            dir = nil
          }
          if (path == null) {
            path = nil
          }
          if (lineno == null) {
            lineno = nil
          }
          self.file = file;
          self.dir = dir;
          self.path = path;
          return self.lineno = lineno;
        };

        return (def.$line_info = function() {
          var self = this;
          return "" + (self.$path()) + ": line " + (self.$lineno());
        }, nil);
      })(self, null);

      self.$attr_reader("file");

      self.$attr_reader("dir");

      self.$attr_reader("path");

      self.$attr_reader("lineno");

      self.$attr_reader("source_lines");

      self.$attr_accessor("process_lines");

      def.$initialize = function(data, cursor, opts) {
        var $a, self = this;
        if (data == null) {
          data = nil
        }
        if (cursor == null) {
          cursor = nil
        }
        if (opts == null) {
          opts = $hash2(["normalize"], {"normalize": false})
        }
        if (($a = cursor['$nil?']()) !== false && $a !== nil) {
          self.file = self.dir = nil;
          self.path = "<stdin>";
          self.lineno = 1;
        } else if (($a = cursor['$is_a?']($opalScope.String)) !== false && $a !== nil) {
          self.file = cursor;
          self.dir = $opalScope.File.$dirname(self.file);
          self.path = $opalScope.File.$basename(self.file);
          self.lineno = 1;
          } else {
          self.file = cursor.$file();
          self.dir = cursor.$dir();
          self.path = ((($a = cursor.$path()) !== false && $a !== nil) ? $a : "<stdin>");
          if (($a = self.file['$nil?']()) === false || $a === nil) {
            if (($a = self.dir['$nil?']()) !== false && $a !== nil) {
              self.dir = $opalScope.File.$dirname(self.file);
              if (self.dir['$=='](".")) {
                self.dir = nil};};
            if (($a = cursor.$path()['$nil?']()) !== false && $a !== nil) {
              self.path = $opalScope.File.$basename(self.file)};};
          self.lineno = ((($a = cursor.$lineno()) !== false && $a !== nil) ? $a : 1);
        };
        self.lines = (function() {if (($a = data['$nil?']()) !== false && $a !== nil) {
          return []
          } else {
          return (self.$prepare_lines(data, opts))
        }; return nil; })();
        self.source_lines = self.lines.$dup();
        self.eof = self.lines['$empty?']();
        self.look_ahead = 0;
        self.process_lines = true;
        return self.unescape_next_line = false;
      };

      def.$prepare_lines = function(data, opts) {
        var $a, $b, self = this;
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = data['$is_a?']((($b = $opal.Object._scope.String) == null ? $opal.cm('String') : $b))) !== false && $a !== nil) {
          if (($a = opts['$[]']("normalize")) !== false && $a !== nil) {
            return $opalScope.Helpers.$normalize_lines_from_string(data)
            } else {
            return data.$each_line().$to_a()
          }
        } else if (($a = opts['$[]']("normalize")) !== false && $a !== nil) {
          return $opalScope.Helpers.$normalize_lines_array(data)
          } else {
          return data.$dup()
        };
      };

      def.$process_line = function(line) {
        var $a, self = this;
        if (($a = self.process_lines) !== false && $a !== nil) {
          self.look_ahead = self.look_ahead['$+'](1)};
        return line;
      };

      def['$has_more_lines?'] = function() {
        var $a, $b, self = this;
        return ($a = (((($b = self.eof) !== false && $b !== nil) ? $b : (self.eof = self.$peek_line()['$nil?']()))), ($a === nil || $a === false));
      };

      def['$next_line_empty?'] = function() {
        var $a, self = this, line = nil;
        return ((($a = ((line = self.$peek_line()))['$nil?']()) !== false && $a !== nil) ? $a : line['$empty?']());
      };

      def.$peek_line = function(direct) {
        var $a, $b, self = this, line = nil;
        if (direct == null) {
          direct = false
        }
        if (($a = ((($b = direct) !== false && $b !== nil) ? $b : self.look_ahead['$>'](0))) !== false && $a !== nil) {
          if (($a = self.unescape_next_line) !== false && $a !== nil) {
            return self.lines.$first()['$[]']($range(1, -1, false))
            } else {
            return self.lines.$first()
          }
        } else if (($a = ((($b = self.eof) !== false && $b !== nil) ? $b : self.lines['$empty?']())) !== false && $a !== nil) {
          self.eof = true;
          self.look_ahead = 0;
          return nil;
        } else if (($a = ((line = self.$process_line(self.lines.$first())))['$nil?']()) !== false && $a !== nil) {
          return self.$peek_line()
          } else {
          return line
        };
      };

      def.$peek_lines = function(num, direct) {
        var $a, $b, TMP_1, $c, TMP_2, self = this, old_look_ahead = nil, result = nil;
        if (num == null) {
          num = 1
        }
        if (direct == null) {
          direct = true
        }
        old_look_ahead = self.look_ahead;
        result = [];
        ($a = ($b = ($range(1, num, false))).$each, $a._p = (TMP_1 = function(){var self = TMP_1._s || this, $a, line = nil;
        if (($a = (line = self.$read_line(direct))) !== false && $a !== nil) {
            return result['$<<'](line)
            } else {
            return ($breaker.$v = nil, $breaker)
          }}, TMP_1._s = self, TMP_1), $a).call($b);
        if (($a = result['$empty?']()) === false || $a === nil) {
          ($a = ($c = result).$reverse_each, $a._p = (TMP_2 = function(line){var self = TMP_2._s || this;if (line == null) line = nil;
          return self.$unshift(line)}, TMP_2._s = self, TMP_2), $a).call($c);
          if (direct !== false && direct !== nil) {
            self.look_ahead = old_look_ahead};};
        return result;
      };

      def.$read_line = function(direct) {
        var $a, $b, $c, self = this;
        if (direct == null) {
          direct = false
        }
        if (($a = ((($b = ((($c = direct) !== false && $c !== nil) ? $c : self.look_ahead['$>'](0))) !== false && $b !== nil) ? $b : self['$has_more_lines?']())) !== false && $a !== nil) {
          return self.$shift()
          } else {
          return nil
        };
      };

      def.$read_lines = function() {
        var $a, $b, self = this, lines = nil;
        lines = [];
        while (($b = self['$has_more_lines?']()) !== false && $b !== nil) {
        lines['$<<'](self.$read_line())};
        return lines;
      };

      $opal.defn(self, '$readlines', def.$read_lines);

      def.$read = function() {
        var self = this;
        return self.$read_lines()['$*']($opalScope.EOL);
      };

      def.$advance = function(direct) {
        var $a, self = this;
        if (direct == null) {
          direct = true
        }
        return ($a = (self.$read_line(direct))['$nil?'](), ($a === nil || $a === false));
      };

      def.$unshift_line = function(line_to_restore) {
        var self = this;
        self.$unshift(line_to_restore);
        return nil;
      };

      $opal.defn(self, '$restore_line', def.$unshift_line);

      def.$unshift_lines = function(lines_to_restore) {
        var $a, $b, TMP_3, self = this;
        ($a = ($b = lines_to_restore).$reverse_each, $a._p = (TMP_3 = function(line){var self = TMP_3._s || this;if (line == null) line = nil;
        return self.$unshift(line)}, TMP_3._s = self, TMP_3), $a).call($b);
        return nil;
      };

      $opal.defn(self, '$restore_lines', def.$unshift_lines);

      def.$replace_line = function(replacement) {
        var self = this;
        self.$advance();
        self.$unshift(replacement);
        return nil;
      };

      def.$skip_blank_lines = function() {
        var $a, $b, self = this, num_skipped = nil, next_line = nil;
        if (($a = self['$eof?']()) !== false && $a !== nil) {
          return 0};
        num_skipped = 0;
        while (($b = (next_line = self.$peek_line())) !== false && $b !== nil) {
        if (($b = next_line['$empty?']()) !== false && $b !== nil) {
          self.$advance();
          num_skipped = num_skipped['$+'](1);
          } else {
          return num_skipped
        }};
        return num_skipped;
      };

      def.$skip_comment_lines = function(opts) {
        var $a, $b, $c, $d, self = this, comment_lines = nil, include_blank_lines = nil, next_line = nil, commentish = nil, match = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        if (($a = self['$eof?']()) !== false && $a !== nil) {
          return []};
        comment_lines = [];
        include_blank_lines = opts['$[]']("include_blank_lines");
        while (($b = (next_line = self.$peek_line())) !== false && $b !== nil) {
        if (($b = (($c = include_blank_lines !== false && include_blank_lines !== nil) ? next_line['$empty?']() : $c)) !== false && $b !== nil) {
          comment_lines['$<<'](self.$read_line())
        } else if (($b = ($c = (commentish = next_line['$start_with?']("//")), $c !== false && $c !== nil ?(match = next_line.$match($opalScope.REGEXP['$[]']("comment_blk"))) : $c)) !== false && $b !== nil) {
          comment_lines['$<<'](self.$read_line());
          ($b = comment_lines).$push.apply($b, [].concat((self.$read_lines_until($hash2(["terminator", "read_last_line", "skip_processing"], {"terminator": match['$[]'](0), "read_last_line": true, "skip_processing": true})))));
        } else if (($c = (($d = commentish !== false && commentish !== nil) ? next_line.$match($opalScope.REGEXP['$[]']("comment")) : $d)) !== false && $c !== nil) {
          comment_lines['$<<'](self.$read_line())
          } else {
          break;
        }};
        return comment_lines;
      };

      def.$skip_line_comments = function() {
        var $a, $b, self = this, comment_lines = nil, next_line = nil;
        if (($a = self['$eof?']()) !== false && $a !== nil) {
          return []};
        comment_lines = [];
        while (($b = (next_line = self.$peek_line())) !== false && $b !== nil) {
        if (($b = next_line.$match($opalScope.REGEXP['$[]']("comment"))) !== false && $b !== nil) {
          comment_lines['$<<'](self.$read_line())
          } else {
          break;
        }};
        return comment_lines;
      };

      def.$terminate = function() {
        var self = this;
        self.lineno = self.lineno['$+'](self.lines.$size());
        self.lines.$clear();
        self.eof = true;
        self.look_ahead = 0;
        return nil;
      };

      def['$eof?'] = function() {
        var $a, self = this;
        return ($a = self['$has_more_lines?'](), ($a === nil || $a === false));
      };

      $opal.defn(self, '$empty?', def['$eof?']);

      def.$read_lines_until = TMP_4 = function(options) {
        var $a, $b, $c, $d, $e, self = this, $iter = TMP_4._p, $yield = $iter || nil, result = nil, restore_process_lines = nil, has_block = nil, terminator = nil, break_on_blank_lines = nil, break_on_list_continuation = nil, skip_line_comments = nil, line_read = nil, line_restored = nil, complete = nil, line = nil;
        if (options == null) {
          options = $hash2([], {})
        }
        TMP_4._p = null;
        result = [];
        if (($a = options['$[]']("skip_first_line")) !== false && $a !== nil) {
          self.$advance()};
        if (($a = ($b = self.process_lines, $b !== false && $b !== nil ?options['$[]']("skip_processing") : $b)) !== false && $a !== nil) {
          self.process_lines = false;
          restore_process_lines = true;
          } else {
          restore_process_lines = false
        };
        has_block = ($yield !== nil);
        if (($a = (terminator = options['$[]']("terminator"))) !== false && $a !== nil) {
          break_on_blank_lines = false;
          break_on_list_continuation = false;
          } else {
          break_on_blank_lines = options['$[]']("break_on_blank_lines");
          break_on_list_continuation = options['$[]']("break_on_list_continuation");
        };
        skip_line_comments = options['$[]']("skip_line_comments");
        line_read = false;
        line_restored = false;
        complete = false;
        while (($b = ($c = ($d = complete, ($d === nil || $d === false)), $c !== false && $c !== nil ?(line = self.$read_line()) : $c)) !== false && $b !== nil) {
        complete = (function() {while (($c = true) !== false && $c !== nil) {
        if (($c = (($d = terminator !== false && terminator !== nil) ? line['$=='](terminator) : $d)) !== false && $c !== nil) {
          return true};
        if (($c = (($d = break_on_blank_lines !== false && break_on_blank_lines !== nil) ? line['$empty?']() : $d)) !== false && $c !== nil) {
          return true};
        if (($c = ($d = (($e = break_on_list_continuation !== false && break_on_list_continuation !== nil) ? line_read : $e), $d !== false && $d !== nil ?line['$==']($opalScope.LIST_CONTINUATION) : $d)) !== false && $c !== nil) {
          options['$[]=']("preserve_last_line", true);
          return true;};
        if (($c = (($d = has_block !== false && has_block !== nil) ? (((($e = $opal.$yield1($yield, line)) === $breaker) ? $breaker.$v : $e)) : $d)) !== false && $c !== nil) {
          return true};
        return false;}; return nil; })();
        if (complete !== false && complete !== nil) {
          if (($b = options['$[]']("read_last_line")) !== false && $b !== nil) {
            result['$<<'](line);
            line_read = true;};
          if (($b = options['$[]']("preserve_last_line")) !== false && $b !== nil) {
            self.$restore_line(line);
            line_restored = true;};
        } else if (($b = ($c = (($d = skip_line_comments !== false && skip_line_comments !== nil) ? line['$start_with?']("//") : $d), $c !== false && $c !== nil ?line.$match($opalScope.REGEXP['$[]']("comment")) : $c)) === false || $b === nil) {
          result['$<<'](line);
          line_read = true;};};
        if (restore_process_lines !== false && restore_process_lines !== nil) {
          self.process_lines = true;
          if (($a = (($b = line_restored !== false && line_restored !== nil) ? terminator['$nil?']() : $b)) !== false && $a !== nil) {
            self.look_ahead = self.look_ahead['$-'](1)};};
        return result;
      };

      def.$shift = function() {
        var $a, self = this;
        self.lineno = self.lineno['$+'](1);
        if (($a = self.look_ahead['$=='](0)) === false || $a === nil) {
          self.look_ahead = self.look_ahead['$-'](1)};
        return self.lines.$shift();
      };

      def.$unshift = function(line) {
        var self = this;
        self.lineno = self.lineno['$-'](1);
        self.look_ahead = self.look_ahead['$+'](1);
        self.eof = false;
        return self.lines.$unshift(line);
      };

      def.$cursor = function() {
        var self = this;
        return $opalScope.Cursor.$new(self.file, self.dir, self.path, self.lineno);
      };

      def.$line_info = function() {
        var self = this;
        return "" + (self.path) + ": line " + (self.lineno);
      };

      $opal.defn(self, '$next_line_info', def.$line_info);

      def.$prev_line_info = function() {
        var self = this;
        return "" + (self.path) + ": line " + (self.lineno['$-'](1));
      };

      def.$lines = function() {
        var self = this;
        return self.lines.$dup();
      };

      def.$string = function() {
        var self = this;
        return self.lines['$*']($opalScope.EOL);
      };

      def.$source = function() {
        var self = this;
        return self.source_lines['$*']($opalScope.EOL);
      };

      return (def.$to_s = function() {
        var self = this;
        return self.$line_info();
      }, nil);
    })(self, null);

    (function($base, $super) {
      function $PreprocessorReader(){};
      var self = $PreprocessorReader = $klass($base, $super, 'PreprocessorReader', $PreprocessorReader);

      var def = $PreprocessorReader._proto, $opalScope = $PreprocessorReader._scope, TMP_5, TMP_6, TMP_7, TMP_20;
      def.document = def.lineno = def.process_lines = def.look_ahead = def.skipping = def.include_stack = def.conditional_stack = def.include_processors = def.maxdepth = def.dir = def.lines = def.file = def.path = def.includes = def.unescape_next_line = nil;
      self.$attr_reader("include_stack");

      self.$attr_reader("includes");

      def.$initialize = TMP_5 = function(document, data, cursor) {
        var $a, $b, $c, self = this, $iter = TMP_5._p, $yield = $iter || nil, include_depth_default = nil;
        if (data == null) {
          data = nil
        }
        if (cursor == null) {
          cursor = nil
        }
        TMP_5._p = null;
        self.document = document;
        $opal.find_super_dispatcher(self, 'initialize', TMP_5, null).apply(self, [data, cursor, $hash2(["normalize"], {"normalize": true})]);
        include_depth_default = document.$attributes().$fetch("max-include-depth", 64).$to_i();
        if (include_depth_default['$<'](0)) {
          include_depth_default = 0};
        self.maxdepth = $hash2(["abs", "rel"], {"abs": include_depth_default, "rel": include_depth_default});
        self.include_stack = [];
        self.includes = (($a = "includes", $b = document.$references(), ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, []))));
        self.skipping = false;
        self.conditional_stack = [];
        return self.include_processors = nil;
      };

      def.$prepare_lines = TMP_6 = function(data, opts) {var $zuper = $slice.call(arguments, 0);
        var $a, $b, $c, $d, self = this, $iter = TMP_6._p, $yield = $iter || nil, result = nil, front_matter = nil, first = nil, last = nil, indent = nil;
        if (opts == null) {
          opts = $hash2([], {})
        }
        TMP_6._p = null;
        result = $opal.find_super_dispatcher(self, 'prepare_lines', TMP_6, $iter).apply(self, $zuper);
        if (($a = ((($b = self.document['$nil?']()) !== false && $b !== nil) ? $b : ($c = (self.document.$attributes()['$has_key?']("skip-front-matter")), ($c === nil || $c === false)))) === false || $a === nil) {
          if (($a = (front_matter = self['$skip_front_matter!'](result))) !== false && $a !== nil) {
            self.document.$attributes()['$[]=']("front-matter", front_matter['$*']($opalScope.EOL))}};
        if (($a = opts.$fetch("condense", true)) !== false && $a !== nil) {
          while (($b = ($c = ($d = ((first = result.$first()))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?first['$empty?']() : $c)) !== false && $b !== nil) {
          ($b = result.$shift(), $b !== false && $b !== nil ?self.lineno = self.lineno['$+'](1) : $b)};
          while (($b = ($c = ($d = ((last = result.$last()))['$nil?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?last['$empty?']() : $c)) !== false && $b !== nil) {
          result.$pop()};};
        if (($a = (indent = opts.$fetch("indent", nil))) !== false && $a !== nil) {
          $opalScope.Lexer['$reset_block_indent!'](result, indent.$to_i())};
        return result;
      };

      def.$process_line = function(line) {
        var $a, $b, $c, $d, self = this, macroish = nil, match = nil;
        if (($a = self.process_lines) === false || $a === nil) {
          return line};
        if (($a = line['$empty?']()) !== false && $a !== nil) {
          self.look_ahead = self.look_ahead['$+'](1);
          return "";};
        macroish = ($a = line['$include?']("::"), $a !== false && $a !== nil ?line['$include?']("[") : $a);
        if (($a = ($b = (($c = macroish !== false && macroish !== nil) ? line['$include?']("if") : $c), $b !== false && $b !== nil ?(match = line.$match($opalScope.REGEXP['$[]']("ifdef_macro"))) : $b)) !== false && $a !== nil) {
          if (($a = line['$start_with?']("\\")) !== false && $a !== nil) {
            self.unescape_next_line = true;
            self.look_ahead = self.look_ahead['$+'](1);
            return line['$[]']($range(1, -1, false));
          } else if (($a = ($b = self).$preprocess_conditional_inclusion.apply($b, [].concat(match.$captures()))) !== false && $a !== nil) {
            self.$advance();
            return nil;
            } else {
            self.look_ahead = self.look_ahead['$+'](1);
            return line;
          }
        } else if (($a = self.skipping) !== false && $a !== nil) {
          self.$advance();
          return nil;
        } else if (($a = ($c = (($d = macroish !== false && macroish !== nil) ? line['$include?']("include::") : $d), $c !== false && $c !== nil ?(match = line.$match($opalScope.REGEXP['$[]']("include_macro"))) : $c)) !== false && $a !== nil) {
          if (($a = line['$start_with?']("\\")) !== false && $a !== nil) {
            self.unescape_next_line = true;
            self.look_ahead = self.look_ahead['$+'](1);
            return line['$[]']($range(1, -1, false));
          } else if (($a = self.$preprocess_include(match['$[]'](1), match['$[]'](2).$strip())) !== false && $a !== nil) {
            return nil
            } else {
            self.look_ahead = self.look_ahead['$+'](1);
            return line;
          }
          } else {
          self.look_ahead = self.look_ahead['$+'](1);
          return line;
        };
      };

      def.$peek_line = TMP_7 = function(direct) {var $zuper = $slice.call(arguments, 0);
        var $a, self = this, $iter = TMP_7._p, $yield = $iter || nil, line = nil;
        if (direct == null) {
          direct = false
        }
        TMP_7._p = null;
        if (($a = (line = $opal.find_super_dispatcher(self, 'peek_line', TMP_7, $iter).apply(self, $zuper))) !== false && $a !== nil) {
          return line
        } else if (($a = self.include_stack['$empty?']()) !== false && $a !== nil) {
          return nil
          } else {
          self.$pop_include();
          return self.$peek_line(direct);
        };
      };

      def.$preprocess_conditional_inclusion = function(directive, target, delimiter, text) {
        var $a, $b, $c, $d, TMP_8, TMP_9, $e, TMP_10, TMP_11, $f, $g, self = this, stack_size = nil, pair = nil, skip = nil, $case = nil, expr_match = nil, lhs = nil, op = nil, rhs = nil, conditional_line = nil;
        if (($a = ((($b = (($c = (((($d = directive['$==']("ifdef")) !== false && $d !== nil) ? $d : directive['$==']("ifndef"))), $c !== false && $c !== nil ?target['$empty?']() : $c))) !== false && $b !== nil) ? $b : ((($c = directive['$==']("endif")) ? ($d = text['$nil?'](), ($d === nil || $d === false)) : $c)))) !== false && $a !== nil) {
          return false};
        if (directive['$==']("endif")) {
          stack_size = self.conditional_stack.$size();
          if (stack_size['$>'](0)) {
            pair = self.conditional_stack.$last();
            if (($a = ((($b = target['$empty?']()) !== false && $b !== nil) ? $b : target['$=='](pair['$[]']("target")))) !== false && $a !== nil) {
              self.conditional_stack.$pop();
              self.skipping = (function() {if (($a = self.conditional_stack['$empty?']()) !== false && $a !== nil) {
                return false
                } else {
                return self.conditional_stack.$last()['$[]']("skipping")
              }; return nil; })();
              } else {
              self.$warn("asciidoctor: ERROR: " + (self.$line_info()) + ": mismatched macro: endif::" + (target) + "[], expected endif::" + (pair['$[]']("target")) + "[]")
            };
            } else {
            self.$warn("asciidoctor: ERROR: " + (self.$line_info()) + ": unmatched macro: endif::" + (target) + "[]")
          };
          return true;};
        skip = false;
        if (($a = self.skipping) === false || $a === nil) {
          $case = directive;if ("ifdef"['$===']($case)) {$case = delimiter;if (nil['$===']($case)) {skip = ($a = self.document.$attributes()['$has_key?'](target), ($a === nil || $a === false))}else if (","['$===']($case)) {skip = ($a = ($b = ($c = target.$split(",")).$detect, $b._p = (TMP_8 = function(name){var self = TMP_8._s || this;
            if (self.document == null) self.document = nil;
if (name == null) name = nil;
          return self.document.$attributes()['$has_key?'](name)}, TMP_8._s = self, TMP_8), $b).call($c), ($a === nil || $a === false))}else if ("+"['$===']($case)) {skip = ($a = ($b = target.$split("+")).$detect, $a._p = (TMP_9 = function(name){var self = TMP_9._s || this, $a;
            if (self.document == null) self.document = nil;
if (name == null) name = nil;
          return ($a = self.document.$attributes()['$has_key?'](name), ($a === nil || $a === false))}, TMP_9._s = self, TMP_9), $a).call($b)}}else if ("ifndef"['$===']($case)) {$case = delimiter;if (nil['$===']($case)) {skip = self.document.$attributes()['$has_key?'](target)}else if (","['$===']($case)) {skip = ($a = ($d = ($e = target.$split(",")).$detect, $d._p = (TMP_10 = function(name){var self = TMP_10._s || this, $a;
            if (self.document == null) self.document = nil;
if (name == null) name = nil;
          return ($a = self.document.$attributes()['$has_key?'](name), ($a === nil || $a === false))}, TMP_10._s = self, TMP_10), $d).call($e), ($a === nil || $a === false))}else if ("+"['$===']($case)) {skip = ($a = ($d = target.$split("+")).$detect, $a._p = (TMP_11 = function(name){var self = TMP_11._s || this;
            if (self.document == null) self.document = nil;
if (name == null) name = nil;
          return self.document.$attributes()['$has_key?'](name)}, TMP_11._s = self, TMP_11), $a).call($d)}}else if ("ifeval"['$===']($case)) {if (($a = ((($f = ($g = target['$empty?'](), ($g === nil || $g === false))) !== false && $f !== nil) ? $f : ($g = (expr_match = text.$strip().$match($opalScope.REGEXP['$[]']("eval_expr"))), ($g === nil || $g === false)))) !== false && $a !== nil) {
            return false};
          lhs = self.$resolve_expr_val(expr_match['$[]'](1));
          op = expr_match['$[]'](2);
          rhs = self.$resolve_expr_val(expr_match['$[]'](3));
          skip = ($a = (lhs.$send(op.$to_sym(), rhs)), ($a === nil || $a === false));}};
        if (($a = ((($f = directive['$==']("ifeval")) !== false && $f !== nil) ? $f : text['$nil?']())) !== false && $a !== nil) {
          if (skip !== false && skip !== nil) {
            self.skipping = true};
          self.conditional_stack['$<<']($hash2(["target", "skip", "skipping"], {"target": target, "skip": skip, "skipping": self.skipping}));
        } else if (($a = ((($f = self.skipping) !== false && $f !== nil) ? $f : skip)) === false || $a === nil) {
          conditional_line = self.$peek_line(true);
          self.$replace_line(text.$rstrip());
          self.$unshift(conditional_line);
          return true;};
        return true;
      };

      def.$preprocess_include = function(target, raw_attributes) {
        var $a, $b, $c, $d, TMP_12, TMP_13, TMP_14, $e, TMP_16, $f, TMP_19, self = this, processor = nil, abs_maxdepth = nil, target_type = nil, include_file = nil, path = nil, inc_lines = nil, tags = nil, attributes = nil, selected = nil, inc_line_offset = nil, inc_lineno = nil, active_tag = nil, tags_found = nil, missing_tags = nil;
        target = self.document.$sub_attributes(target, $hash2(["attribute_missing"], {"attribute_missing": "drop-line"}));
        if (($a = target['$empty?']()) !== false && $a !== nil) {
          if (self.document.$attributes().$fetch("attribute-missing", $opalScope.Compliance.$attribute_missing())['$==']("skip")) {
            return false
            } else {
            self.$advance();
            return true;
          }
        } else if (($a = ($b = self['$include_processors?'](), $b !== false && $b !== nil ?(processor = ($c = ($d = self.include_processors).$find, $c._p = (TMP_12 = function(candidate){var self = TMP_12._s || this;if (candidate == null) candidate = nil;
        return candidate['$handles?'](target)}, TMP_12._s = self, TMP_12), $c).call($d)) : $b)) !== false && $a !== nil) {
          self.$advance();
          processor.$process(self, target, $opalScope.AttributeList.$new(raw_attributes).$parse());
          return true;
        } else if (self.document.$safe()['$>='](($opalScope.SafeMode)._scope.SECURE)) {
          self.$replace_line("link:" + (target) + "[]");
          return true;
        } else if (($a = (($b = ((abs_maxdepth = self.maxdepth['$[]']("abs")))['$>'](0)) ? self.include_stack.$size()['$>='](abs_maxdepth) : $b)) !== false && $a !== nil) {
          self.$warn("asciidoctor: ERROR: " + (self.$line_info()) + ": maximum include depth of " + (self.maxdepth['$[]']("rel")) + " exceeded");
          return false;
        } else if (abs_maxdepth['$>'](0)) {
          if (($a = ($b = target['$include?'](":"), $b !== false && $b !== nil ?target.$match($opalScope.REGEXP['$[]']("uri_sniff")) : $b)) !== false && $a !== nil) {
            if (($a = self.document.$attributes()['$has_key?']("allow-uri-read")) === false || $a === nil) {
              self.$replace_line("link:" + (target) + "[]");
              return true;};
            target_type = "uri";
            include_file = path = target;
            if (($a = self.document.$attributes()['$has_key?']("cache-uri")) !== false && $a !== nil) {
              $opalScope.Helpers.$require_library("open-uri/cached", "open-uri-cached")
              } else {
              (($a = $opal.Object._scope.OpenURI) == null ? $opal.cm('OpenURI') : $a)
            };
            } else {
            target_type = "file";
            include_file = self.document.$normalize_system_path(target, self.dir, nil, $hash2(["target_name"], {"target_name": "include file"}));
            if (($a = ($b = $opalScope.File['$file?'](include_file), ($b === nil || $b === false))) !== false && $a !== nil) {
              self.$warn("asciidoctor: WARNING: " + (self.$line_info()) + ": include file not found: " + (include_file));
              self.$advance();
              return true;};
            path = $opalScope.PathResolver.$new().$relative_path(include_file, self.document.$base_dir());
          };
          inc_lines = nil;
          tags = nil;
          attributes = $hash2([], {});
          if (($a = ($b = raw_attributes['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
            attributes = $opalScope.AttributeList.$new(raw_attributes).$parse();
            if (($a = attributes['$has_key?']("lines")) !== false && $a !== nil) {
              inc_lines = [];
              ($a = ($b = attributes['$[]']("lines").$split($opalScope.REGEXP['$[]']("ssv_or_csv_delim"))).$each, $a._p = (TMP_13 = function(linedef){var self = TMP_13._s || this, $a, $b, $c, from = nil, to = nil;if (linedef == null) linedef = nil;
              if (($a = linedef['$include?']("..")) !== false && $a !== nil) {
                  $a = $opal.to_ary(($b = ($c = linedef.$split("..")).$map, $b._p = "to_i".$to_proc(), $b).call($c)), from = ($a[0] == null ? nil : $a[0]), to = ($a[1] == null ? nil : $a[1]);
                  if (to['$=='](-1)) {
                    inc_lines['$<<'](from);
                    return inc_lines['$<<']((1.0)['$/'](0.0));
                    } else {
                    return inc_lines.$concat($opalScope.Range.$new(from, to).$to_a())
                  };
                  } else {
                  return inc_lines['$<<'](linedef.$to_i())
                }}, TMP_13._s = self, TMP_13), $a).call($b);
              inc_lines = inc_lines.$sort().$uniq();
            } else if (($a = attributes['$has_key?']("tag")) !== false && $a !== nil) {
              tags = [attributes['$[]']("tag")].$to_set()
            } else if (($a = attributes['$has_key?']("tags")) !== false && $a !== nil) {
              tags = attributes['$[]']("tags").$split($opalScope.REGEXP['$[]']("ssv_or_csv_delim")).$uniq().$to_set()};};
          if (($a = ($c = inc_lines['$nil?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
            if (($a = ($c = inc_lines['$empty?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
              selected = [];
              inc_line_offset = 0;
              inc_lineno = 0;
              try {
              ($a = ($c = self).$open, $a._p = (TMP_14 = function(f){var self = TMP_14._s || this, $a, $b, TMP_15;if (f == null) f = nil;
                return ($a = ($b = f).$each_line, $a._p = (TMP_15 = function(l){var self = TMP_15._s || this, $a, $b, take = nil;if (l == null) l = nil;
                  inc_lineno = inc_lineno['$+'](1);
                    take = inc_lines.$first();
                    if (($a = ($b = take['$is_a?']($opalScope.Float), $b !== false && $b !== nil ?take['$infinite?']() : $b)) !== false && $a !== nil) {
                      selected.$push(l);
                      if (inc_line_offset['$=='](0)) {
                        return inc_line_offset = inc_lineno
                        } else {
                        return nil
                      };
                      } else {
                      if (f.$lineno()['$=='](take)) {
                        selected.$push(l);
                        if (inc_line_offset['$=='](0)) {
                          inc_line_offset = inc_lineno};
                        inc_lines.$shift();};
                      if (($a = inc_lines['$empty?']()) !== false && $a !== nil) {
                        return ($breaker.$v = nil, $breaker)
                        } else {
                        return nil
                      };
                    };}, TMP_15._s = self, TMP_15), $a).call($b)}, TMP_14._s = self, TMP_14), $a).call($c, include_file, "r")
              } catch ($err) {if (true) {
                self.$warn("asciidoctor: WARNING: " + (self.$line_info()) + ": include " + (target_type) + " not readable: " + (include_file));
                self.$advance();
                return true;
                }else { throw $err; }
              };
              self.$advance();
              self.$push_include(selected, include_file, path, inc_line_offset, attributes);}
          } else if (($a = ($e = tags['$nil?'](), ($e === nil || $e === false))) !== false && $a !== nil) {
            if (($a = ($e = tags['$empty?'](), ($e === nil || $e === false))) !== false && $a !== nil) {
              selected = [];
              inc_line_offset = 0;
              inc_lineno = 0;
              active_tag = nil;
              tags_found = $opalScope.Set.$new();
              try {
              ($a = ($e = self).$open, $a._p = (TMP_16 = function(f){var self = TMP_16._s || this, $a, $b, TMP_17;if (f == null) f = nil;
                return ($a = ($b = f).$each_line, $a._p = (TMP_17 = function(l){var self = TMP_17._s || this, $a, $b, TMP_18;if (l == null) l = nil;
                  inc_lineno = inc_lineno['$+'](1);
                    if (($a = $opalScope.FORCE_ENCODING) !== false && $a !== nil) {
                      l.$force_encoding(((($a = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $a))._scope.UTF_8)};
                    if (($a = ($b = active_tag['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
                      if (($a = l['$include?']("end::" + (active_tag) + "[]")) !== false && $a !== nil) {
                        return active_tag = nil
                        } else {
                        selected.$push(l);
                        if (inc_line_offset['$=='](0)) {
                          return inc_line_offset = inc_lineno
                          } else {
                          return nil
                        };
                      }
                      } else {
                      return ($a = ($b = tags).$each, $a._p = (TMP_18 = function(tag){var self = TMP_18._s || this, $a;if (tag == null) tag = nil;
                      if (($a = l['$include?']("tag::" + (tag) + "[]")) !== false && $a !== nil) {
                          active_tag = tag;
                          tags_found['$<<'](tag);
                          return ($breaker.$v = nil, $breaker);
                          } else {
                          return nil
                        }}, TMP_18._s = self, TMP_18), $a).call($b)
                    };}, TMP_17._s = self, TMP_17), $a).call($b)}, TMP_16._s = self, TMP_16), $a).call($e, include_file, "r")
              } catch ($err) {if (true) {
                self.$warn("asciidoctor: WARNING: " + (self.$line_info()) + ": include " + (target_type) + " not readable: " + (include_file));
                self.$advance();
                return true;
                }else { throw $err; }
              };
              if (($a = ((missing_tags = tags['$-'](tags_found)))['$empty?']()) === false || $a === nil) {
                self.$warn("asciidoctor: WARNING: " + (self.$line_info()) + ": tag" + ((function() {if (missing_tags.$size()['$>'](1)) {
                  return "s"
                  } else {
                  return nil
                }; return nil; })()) + " '" + (missing_tags.$to_a()['$*'](",")) + "' not found in include " + (target_type) + ": " + (include_file))};
              self.$advance();
              self.$push_include(selected, include_file, path, inc_line_offset, attributes);}
            } else {
            try {
            self.$advance();
              self.$push_include(($a = ($f = self).$open, $a._p = (TMP_19 = function(f){var self = TMP_19._s || this;if (f == null) f = nil;
              return f.$read()}, TMP_19._s = self, TMP_19), $a).call($f, include_file, "r"), include_file, path, 1, attributes);
            } catch ($err) {if (true) {
              self.$warn("asciidoctor: WARNING: " + (self.$line_info()) + ": include " + (target_type) + " not readable: " + (include_file));
              self.$advance();
              return true;
              }else { throw $err; }
            }
          };
          return true;
          } else {
          return false
        };
      };

      def.$push_include = function(data, file, path, lineno, attributes) {
        var $a, self = this, depth = nil;
        if (file == null) {
          file = nil
        }
        if (path == null) {
          path = nil
        }
        if (lineno == null) {
          lineno = 1
        }
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        self.include_stack['$<<']([self.lines, self.file, self.dir, self.path, self.lineno, self.maxdepth, self.process_lines]);
        self.includes['$<<']($opalScope.Helpers.$rootname(path));
        self.file = file;
        self.dir = $opalScope.File.$dirname(file);
        self.path = path;
        self.lineno = lineno;
        self.process_lines = $opalScope.ASCIIDOC_EXTENSIONS['$[]']($opalScope.File.$extname(self.file));
        if (($a = attributes['$has_key?']("depth")) !== false && $a !== nil) {
          depth = attributes['$[]']("depth").$to_i();
          if (depth['$<='](0)) {
            depth = 1};
          self.maxdepth = $hash2(["abs", "rel"], {"abs": (self.include_stack.$size()['$-'](1))['$+'](depth), "rel": depth});};
        self.lines = self.$prepare_lines(data, $hash2(["normalize", "condense", "indent"], {"normalize": true, "condense": false, "indent": attributes['$[]']("indent")}));
        if (($a = self.lines['$empty?']()) !== false && $a !== nil) {
          self.$pop_include()
          } else {
          self.eof = false;
          self.look_ahead = 0;
        };
        return nil;
      };

      def.$pop_include = function() {
        var $a, self = this;
        if (self.include_stack.$size()['$>'](0)) {
          $a = $opal.to_ary(self.include_stack.$pop()), self.lines = ($a[0] == null ? nil : $a[0]), self.file = ($a[1] == null ? nil : $a[1]), self.dir = ($a[2] == null ? nil : $a[2]), self.path = ($a[3] == null ? nil : $a[3]), self.lineno = ($a[4] == null ? nil : $a[4]), self.maxdepth = ($a[5] == null ? nil : $a[5]), self.process_lines = ($a[6] == null ? nil : $a[6]);
          self.eof = self.lines['$empty?']();
          self.look_ahead = 0;};
        return nil;
      };

      def.$include_depth = function() {
        var self = this;
        return self.include_stack.$size();
      };

      def['$exceeded_max_depth?'] = function() {
        var $a, $b, self = this, abs_maxdepth = nil;
        if (($a = (($b = ((abs_maxdepth = self.maxdepth['$[]']("abs")))['$>'](0)) ? self.include_stack.$size()['$>='](abs_maxdepth) : $b)) !== false && $a !== nil) {
          return self.maxdepth['$[]']("rel")
          } else {
          return false
        };
      };

      def.$shift = TMP_20 = function() {var $zuper = $slice.call(arguments, 0);
        var $a, self = this, $iter = TMP_20._p, $yield = $iter || nil;
        TMP_20._p = null;
        if (($a = self.unescape_next_line) !== false && $a !== nil) {
          self.unescape_next_line = false;
          return $opal.find_super_dispatcher(self, 'shift', TMP_20, $iter).apply(self, $zuper)['$[]']($range(1, -1, false));
          } else {
          return $opal.find_super_dispatcher(self, 'shift', TMP_20, $iter).apply(self, $zuper)
        };
      };

      def['$skip_front_matter!'] = function(data, increment_linenos) {
        var $a, $b, $c, $d, self = this, front_matter = nil, original_data = nil;
        if (increment_linenos == null) {
          increment_linenos = true
        }
        front_matter = nil;
        if (($a = (($b = data.$size()['$>'](0)) ? data.$first()['$==']("---") : $b)) !== false && $a !== nil) {
          original_data = data.$dup();
          front_matter = [];
          data.$shift();
          if (increment_linenos !== false && increment_linenos !== nil) {
            self.lineno = self.lineno['$+'](1)};
          while (($b = ($c = ($d = data['$empty?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?($d = data.$first()['$==']("---"), ($d === nil || $d === false)) : $c)) !== false && $b !== nil) {
          front_matter.$push(data.$shift());
          if (increment_linenos !== false && increment_linenos !== nil) {
            self.lineno = self.lineno['$+'](1)};};
          if (($a = data['$empty?']()) !== false && $a !== nil) {
            ($a = data).$unshift.apply($a, [].concat(original_data));
            if (increment_linenos !== false && increment_linenos !== nil) {
              self.lineno = 0};
            front_matter = nil;
            } else {
            data.$shift();
            if (increment_linenos !== false && increment_linenos !== nil) {
              self.lineno = self.lineno['$+'](1)};
          };};
        return front_matter;
      };

      def.$resolve_expr_val = function(str) {
        var $a, $b, $c, self = this, val = nil, type = nil;
        val = str;
        type = nil;
        if (($a = ((($b = ($c = val['$start_with?']("\""), $c !== false && $c !== nil ?val['$end_with?']("\"") : $c)) !== false && $b !== nil) ? $b : ($c = val['$start_with?']("'"), $c !== false && $c !== nil ?val['$end_with?']("'") : $c))) !== false && $a !== nil) {
          type = "string";
          val = val['$[]']($range(1, -1, true));};
        if (($a = val['$include?']("{")) !== false && $a !== nil) {
          val = self.document.$sub_attributes(val)};
        if (($a = type['$==']("string")) === false || $a === nil) {
          if (($a = val['$empty?']()) !== false && $a !== nil) {
            val = nil
          } else if (($a = val.$strip()['$empty?']()) !== false && $a !== nil) {
            val = " "
          } else if (val['$==']("true")) {
            val = true
          } else if (val['$==']("false")) {
            val = false
          } else if (($a = val['$include?'](".")) !== false && $a !== nil) {
            val = val.$to_f()
            } else {
            val = val.$to_i()
          }};
        return val;
      };

      def['$include_processors?'] = function() {
        var $a, $b, self = this;
        if (($a = self.include_processors['$nil?']()) !== false && $a !== nil) {
          if (($a = ($b = self.document['$extensions?'](), $b !== false && $b !== nil ?self.document.$extensions()['$include_processors?']() : $b)) !== false && $a !== nil) {
            self.include_processors = self.document.$extensions().$load_include_processors(self.document);
            return true;
            } else {
            self.include_processors = false;
            return false;
          }
          } else {
          return ($a = self.include_processors['$=='](false), ($a === nil || $a === false))
        };
      };

      return (def.$to_s = function() {
        var $a, $b, TMP_21, self = this;
        return "" + (self.$class().$name()) + " [path: " + (self.path) + ", line #: " + (self.lineno) + ", include depth: " + (self.include_stack.$size()) + ", include stack: [" + (($a = ($b = self.include_stack).$map, $a._p = (TMP_21 = function(inc){var self = TMP_21._s || this;if (inc == null) inc = nil;
        return inc.$to_s()}, TMP_21._s = self, TMP_21), $a).call($b).$join(", ")) + "]]";
      }, nil);
    })(self, $opalScope.Reader);
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $BaseTemplate(){};
      var self = $BaseTemplate = $klass($base, $super, 'BaseTemplate', $BaseTemplate);

      var def = $BaseTemplate._proto, $opalScope = $BaseTemplate._scope;
      def.view = nil;
      self.$attr_reader("view");

      self.$attr_reader("backend");

      self.$attr_reader("eruby");

      def.$initialize = function(view, backend, eruby) {
        var self = this;
        self.view = view;
        self.backend = backend;
        return self.eruby = eruby;
      };

      $opal.defs(self, '$inherited', function(klass) {
        var $a, self = this;
        if (self.template_classes == null) self.template_classes = nil;

        if (self['$==']($opalScope.BaseTemplate)) {
          ((($a = self.template_classes) !== false && $a !== nil) ? $a : self.template_classes = []);
          return self.template_classes['$<<'](klass);
          } else {
          return self.$superclass().$inherited(klass)
        };
      });

      $opal.defs(self, '$template_classes', function() {
        var self = this;
        if (self.template_classes == null) self.template_classes = nil;

        return self.template_classes;
      });

      def.$render = function(node, locals) {
        var $a, $b, $c, $d, self = this, tmpl = nil, $case = nil, result = nil;
        if (node == null) {
          node = $opalScope.Object.$new()
        }
        if (locals == null) {
          locals = $hash2([], {})
        }
        tmpl = self.$template();
        $case = tmpl;if ("invoke_result"['$===']($case)) {return self.$result(node)}else if ("content"['$===']($case)) {result = node.$content()}else {result = tmpl.$result(node.$get_binding(self))};
        if (($a = ($b = ($c = (((($d = self.view['$==']("document")) !== false && $d !== nil) ? $d : self.view['$==']("embedded"))), $c !== false && $c !== nil ?node.$renderer().$compact() : $c), $b !== false && $b !== nil ?($c = node.$document()['$nested?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          return self.$compact(result)
          } else {
          return result
        };
      };

      def.$compact = function(str) {
        var self = this;
        return str.$gsub($opalScope.BLANK_LINE_PATTERN, "").$gsub($opalScope.LINE_FEED_ENTITY, $opalScope.EOL);
      };

      def.$preserve_endlines = function(str, node) {
        var $a, self = this;
        if (($a = node.$renderer().$compact()) !== false && $a !== nil) {
          return str.$gsub($opalScope.EOL, $opalScope.LINE_FEED_ENTITY)
          } else {
          return str
        };
      };

      def.$template = function() {
        var self = this;
        return self.$raise("You chilluns need to make your own template");
      };

      return (def.$attribute = function(name, key) {
        var $a, self = this, type = nil;
        type = (function() {if (($a = key['$is_a?']($opalScope.Symbol)) !== false && $a !== nil) {
          return "attr"
          } else {
          return "var"
        }; return nil; })();
        if (type['$==']("attr")) {
          return "<% if attr? '" + (key) + "' %> " + (name) + "=\"<%= attr '" + (key) + "' %>\"<% end %>"
          } else {
          return "<% if " + (key) + " %> " + (name) + "=\"<%= " + (key) + " %>\"<% end %>"
        };
      }, nil);
    })(self, null);

    (function($base) {
      var self = $module($base, 'EmptyTemplate');

      var def = self._proto, $opalScope = self._scope;
      def.$result = function(node) {
        var self = this;
        return "";
      };

      def.$template = function() {
        var self = this;
        return "invoke_result";
      };
            ;$opal.donate(self, ["$result", "$template"]);
    })(self);
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Renderer(){};
      var self = $Renderer = $klass($base, $super, 'Renderer', $Renderer);

      var def = $Renderer._proto, $opalScope = $Renderer._scope;
      def.views = def.chomp_result = nil;
      $opal.cdecl($opalScope, 'RE_ASCIIDOCTOR_NAMESPACE', /^Asciidoctor::/);

      $opal.cdecl($opalScope, 'RE_TEMPLATE_CLASS_SUFFIX', /Template$/);

      $opal.cdecl($opalScope, 'RE_CAMELCASE_BOUNDARY_1', /([[:upper:]]+)([[:upper:]][a-zA-Z])/);

      $opal.cdecl($opalScope, 'RE_CAMELCASE_BOUNDARY_2', /([[:lower:]])([[:upper:]])/);

      self.$attr_reader("compact");

      self.$attr_reader("cache");

      ($opal.cvars['@@global_cache'] = nil);

      def.$initialize = function(options) {
        var $a, $b, TMP_1, $c, TMP_2, $d, TMP_3, $e, TMP_4, self = this, backend = nil, $case = nil, eruby = nil, template_dirs = nil, template_cache = nil, view_opts = nil, slim_loaded = nil, path_resolver = nil, engine = nil;
        if (options == null) {
          options = $hash2([], {})
        }
        self.debug = ($a = ($b = options['$[]']("debug"), ($b === nil || $b === false)), ($a === nil || $a === false));
        self.views = $hash2([], {});
        self.compact = options['$[]']("compact");
        self.cache = nil;
        self.chomp_result = false;
        backend = options['$[]']("backend");
        if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) !== false && $a !== nil) {
          ($a = ($b = (($c = $opal.Object._scope.Template) == null ? $opal.cm('Template') : $c).$instance_variable_get("@_cache")).$each, $a._p = (TMP_1 = function(path, tmpl){var self = TMP_1._s || this;
            if (self.views == null) self.views = nil;
if (path == null) path = nil;if (tmpl == null) tmpl = nil;
          return self.views['$[]='](($opalScope.File.$basename(path)), tmpl)}, TMP_1._s = self, TMP_1), $a).call($b);
          return nil;};
        $case = backend;if ("html5"['$===']($case) || "docbook45"['$===']($case) || "docbook5"['$===']($case)) {eruby = self.$load_eruby(options['$[]']("eruby"));
        ;
        ;
        ($a = ($c = $opalScope.BaseTemplate.$template_classes()).$each, $a._p = (TMP_2 = function(tc){var self = TMP_2._s || this, $a, view_name = nil, view_backend = nil;
          if (self.views == null) self.views = nil;
if (tc == null) tc = nil;
        if (($a = tc.$to_s().$downcase()['$include?']("::"['$+'](backend)['$+']("::"))) !== false && $a !== nil) {
            $a = $opal.to_ary(self.$class().$extract_view_mapping(tc)), view_name = ($a[0] == null ? nil : $a[0]), view_backend = ($a[1] == null ? nil : $a[1]);
            if (view_backend['$=='](backend)) {
              return self.views['$[]='](view_name, tc.$new(view_name, backend, eruby))
              } else {
              return nil
            };
            } else {
            return nil
          }}, TMP_2._s = self, TMP_2), $a).call($c);}else {($a = ($d = $opalScope.Debug).$debug, $a._p = (TMP_3 = function(){var self = TMP_3._s || this;
        return "No built-in templates for backend: " + (backend)}, TMP_3._s = self, TMP_3), $a).call($d)};
        if (($a = (template_dirs = options.$delete("template_dirs"))) !== false && $a !== nil) {
          $opalScope.Helpers.$require_library("tilt");
          self.chomp_result = true;
          if (($a = ((template_cache = options['$[]']("template_cache")))['$==='](true)) !== false && $a !== nil) {
            self.cache = (((($a = (($e = $opal.cvars['@@global_cache']) == null ? nil : $e)) !== false && $a !== nil) ? $a : ($opal.cvars['@@global_cache'] = $opalScope.TemplateCache.$new())))
          } else if (template_cache !== false && template_cache !== nil) {
            self.cache = template_cache};
          view_opts = $hash2(["erb", "haml", "slim"], {"erb": $hash2(["trim"], {"trim": "<"}), "haml": $hash2(["format", "attr_wrapper", "ugly", "escape_attrs"], {"format": "xhtml", "attr_wrapper": "\"", "ugly": true, "escape_attrs": false}), "slim": $hash2(["disable_escape", "sort_attrs", "pretty"], {"disable_escape": true, "sort_attrs": false, "pretty": false})});
          if (options['$[]']("htmlsyntax")['$==']("html")) {
            view_opts['$[]']("haml")['$[]=']("format", view_opts['$[]']("slim")['$[]=']("format", "html5"))};
          slim_loaded = false;
          path_resolver = $opalScope.PathResolver.$new();
          engine = options['$[]']("template_engine");
          return ($a = ($e = template_dirs).$each, $a._p = (TMP_4 = function(template_dir){var self = TMP_4._s || this, $a, $b, TMP_5, $c, $d, TMP_7, template_glob = nil, helpers = nil, scan_result = nil;
            if (self.cache == null) self.cache = nil;
            if (self.views == null) self.views = nil;
if (template_dir == null) template_dir = nil;
          template_dir = path_resolver.$system_path(template_dir, nil);
            template_glob = "*";
            if (engine !== false && engine !== nil) {
              template_glob = "*." + (engine);
              if (($a = $opalScope.File['$directory?']($opalScope.File.$join(template_dir, engine))) !== false && $a !== nil) {
                template_dir = $opalScope.File.$join(template_dir, engine)};};
            if (($a = $opalScope.File['$directory?']($opalScope.File.$join(template_dir, backend))) !== false && $a !== nil) {
              template_dir = $opalScope.File.$join(template_dir, backend)};
            if (($a = ($b = self.cache, $b !== false && $b !== nil ?self.cache['$cached?']("scan", template_dir, template_glob) : $b)) !== false && $a !== nil) {
              self.views.$update(self.cache.$fetch("scan", template_dir, template_glob));
              return nil;;};
            helpers = nil;
            scan_result = $hash2([], {});
            ($a = ($b = ($c = ($d = $opalScope.Dir.$glob($opalScope.File.$join(template_dir, template_glob))).$select, $c._p = (TMP_7 = function(f){var self = TMP_7._s || this;if (f == null) f = nil;
            return $opalScope.File['$file?'](f)}, TMP_7._s = self, TMP_7), $c).call($d)).$each, $a._p = (TMP_5 = function(template){var self = TMP_5._s || this, $a, $b, $c, TMP_6, basename = nil, name_parts = nil, view_name = nil, ext_name = nil, opts = nil;
              if (self.cache == null) self.cache = nil;
              if (self.views == null) self.views = nil;
if (template == null) template = nil;
            basename = $opalScope.File.$basename(template);
              if (basename['$==']("helpers.rb")) {
                helpers = template;
                return nil;;};
              name_parts = basename.$split(".");
              if (name_parts.$size()['$<'](2)) {
                return nil;};
              view_name = name_parts.$first();
              ext_name = name_parts.$last();
              if (($a = (($b = ext_name['$==']("slim")) ? ($c = slim_loaded, ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
                $opalScope.Helpers.$require_library("slim")};
              if (($a = $opalScope.Tilt['$registered?'](ext_name)) === false || $a === nil) {
                return nil;};
              opts = view_opts['$[]'](ext_name.$to_sym());
              if (($a = self.cache) !== false && $a !== nil) {
                return self.views['$[]='](view_name, scan_result['$[]='](view_name, ($a = ($b = self.cache).$fetch, $a._p = (TMP_6 = function(){var self = TMP_6._s || this;
                return $opalScope.Tilt.$new(template, nil, opts)}, TMP_6._s = self, TMP_6), $a).call($b, "view", template)))
                } else {
                return self.views['$[]='](view_name, $opalScope.Tilt.$new(template, nil, opts))
              };}, TMP_5._s = self, TMP_5), $a).call($b);
            if (($a = helpers['$nil?']()) === false || $a === nil) {
              };
            if (($a = self.cache) !== false && $a !== nil) {
              return self.cache.$store(scan_result, "scan", template_dir, template_glob)
              } else {
              return nil
            };}, TMP_4._s = self, TMP_4), $a).call($e);
          } else {
          return nil
        };
      };

      def.$render = function(view, object, locals) {
        var $a, $b, self = this;
        if (locals == null) {
          locals = $hash2([], {})
        }
        if (($a = ($b = self.views['$has_key?'](view), ($b === nil || $b === false))) !== false && $a !== nil) {
          self.$raise("Couldn't find a view in @views for " + (view))};
        if (($a = self.chomp_result) !== false && $a !== nil) {
          return self.views['$[]'](view).$render(object, locals).$chomp()
          } else {
          return self.views['$[]'](view).$render(object, locals)
        };
      };

      def.$views = function() {
        var self = this, readonly_views = nil;
        readonly_views = self.views.$dup();
        readonly_views.$freeze();
        return readonly_views;
      };

      def.$register_view = function(view_name, tilt_template) {
        var self = this;
        return self.views['$[]='](view_name, tilt_template);
      };

      def.$load_eruby = function(name) {
        var $a, $b, $c, self = this;
        if (($a = ((($b = name['$nil?']()) !== false && $b !== nil) ? $b : ($c = ["erb", "erubis"]['$include?'](name), ($c === nil || $c === false)))) !== false && $a !== nil) {
          name = "erb"};
        if (name['$==']("erb")) {
          return (($a = $opal.Object._scope.ERB) == null ? $opal.cm('ERB') : $a)
        } else if (name['$==']("erubis")) {
          $opalScope.Helpers.$require_library("erubis");
          return ((($a = $opal.Object._scope.Erubis) == null ? $opal.cm('Erubis') : $a))._scope.FastEruby;
          } else {
          return nil
        };
      };

      $opal.defs(self, '$global_cache', function() {
        var $a, self = this;
        return (($a = $opal.cvars['@@global_cache']) == null ? nil : $a);
      });

      $opal.defs(self, '$reset_global_cache', function() {
        var $a, $b, self = this;
        if (($a = (($b = $opal.cvars['@@global_cache']) == null ? nil : $b)) !== false && $a !== nil) {
          return (($a = $opal.cvars['@@global_cache']) == null ? nil : $a).$clear()
          } else {
          return nil
        };
      });

      $opal.defs(self, '$extract_view_mapping', function(qualified_class) {
        var $a, self = this, view_name = nil, backend = nil;
        $a = $opal.to_ary(qualified_class.$to_s().$sub($opalScope.RE_ASCIIDOCTOR_NAMESPACE, "").$sub($opalScope.RE_TEMPLATE_CLASS_SUFFIX, "").$split("::").$reverse()), view_name = ($a[0] == null ? nil : $a[0]), backend = ($a[1] == null ? nil : $a[1]);
        view_name = self.$camelcase_to_underscore(view_name);
        if (($a = backend['$nil?']()) === false || $a === nil) {
          backend = backend.$downcase()};
        return [view_name, backend];
      });

      return ($opal.defs(self, '$camelcase_to_underscore', function(str) {
        var self = this;
        return str.$gsub($opalScope.RE_CAMELCASE_BOUNDARY_1, "1_2").$gsub($opalScope.RE_CAMELCASE_BOUNDARY_2, "1_2").$downcase();
      }), nil);
    })(self, null);

    (function($base, $super) {
      function $TemplateCache(){};
      var self = $TemplateCache = $klass($base, $super, 'TemplateCache', $TemplateCache);

      var def = $TemplateCache._proto, $opalScope = $TemplateCache._scope, TMP_8;
      def.cache = nil;
      self.$attr_reader("cache");

      def.$initialize = function() {
        var self = this;
        return self.cache = $hash2([], {});
      };

      def['$cached?'] = function(key) {
        var self = this;
        key = $slice.call(arguments, 0);
        return self.cache['$has_key?'](key);
      };

      def.$fetch = TMP_8 = function(key) {
        var $a, $b, $c, $d, self = this, $iter = TMP_8._p, $yield = $iter || nil;
        key = $slice.call(arguments, 0);
        TMP_8._p = null;
        if (($yield !== nil)) {
          return ($a = key, $b = self.cache, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, ((($d = $opal.$yieldX($yield, [])) === $breaker) ? $breaker.$v : $d))))
          } else {
          return self.cache['$[]'](key)
        };
      };

      def.$store = function(value, key) {
        var self = this;
        key = $slice.call(arguments, 1);
        return self.cache['$[]='](key, value);
      };

      return (def.$clear = function() {
        var self = this;
        return self.cache = $hash2([], {});
      }, nil);
    })(self, null);
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Section(){};
      var self = $Section = $klass($base, $super, 'Section', $Section);

      var def = $Section._proto, $opalScope = $Section._scope, TMP_1, TMP_2, TMP_3;
      def.level = def.document = def.parent = def.number = def.title = def.numbered = def.blocks = nil;
      self.$attr_accessor("index");

      self.$attr_accessor("number");

      self.$attr_accessor("sectname");

      self.$attr_accessor("special");

      self.$attr_accessor("numbered");

      def.$initialize = TMP_1 = function(parent, level, numbered) {
        var $a, $b, $c, self = this, $iter = TMP_1._p, $yield = $iter || nil;
        if (parent == null) {
          parent = nil
        }
        if (level == null) {
          level = nil
        }
        if (numbered == null) {
          numbered = true
        }
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, "section"]);
        self.template_name = "section";
        if (($a = level['$nil?']()) !== false && $a !== nil) {
          if (($a = ($b = parent['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
            self.level = parent.$level()['$+'](1)
          } else if (($a = self.level['$nil?']()) !== false && $a !== nil) {
            self.level = 1}
          } else {
          self.level = level
        };
        self.numbered = (($a = numbered !== false && numbered !== nil) ? self.level['$>'](0) : $a);
        self.special = ($a = ($b = ($c = parent['$nil?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?parent.$context()['$==']("section") : $b), $a !== false && $a !== nil ?parent.$special() : $a);
        self.index = 0;
        return self.number = 1;
      };

      $opal.defn(self, '$name', def.$title);

      def.$generate_id = function() {
        var $a, $b, self = this, sep = nil, pre = nil, base_id = nil, gen_id = nil, cnt = nil;
        if (($a = self.document.$attributes()['$has_key?']("sectids")) !== false && $a !== nil) {
          sep = ((($a = self.document.$attributes()['$[]']("idseparator")) !== false && $a !== nil) ? $a : "_");
          pre = ((($a = self.document.$attributes()['$[]']("idprefix")) !== false && $a !== nil) ? $a : "_");
          base_id = "" + (pre) + (self.$title().$downcase().$gsub($opalScope.REGEXP['$[]']("illegal_sectid_chars"), sep).$tr_s(sep, sep).$chomp(sep));
          if (($a = ($b = pre['$empty?'](), $b !== false && $b !== nil ?base_id['$start_with?'](sep) : $b)) !== false && $a !== nil) {
            base_id = base_id['$[]']($range(1, -1, false));
            while (($b = base_id['$start_with?'](sep)) !== false && $b !== nil) {
            base_id = base_id['$[]']($range(1, -1, false))};};
          gen_id = base_id;
          cnt = 2;
          while (($b = self.document.$references()['$[]']("ids")['$has_key?'](gen_id)) !== false && $b !== nil) {
          gen_id = "" + (base_id) + (sep) + (cnt);
          cnt = cnt['$+'](1);};
          return gen_id;
          } else {
          return nil
        };
      };

      def.$sectnum = function(delimiter, append) {
        var $a, $b, $c, $d, $e, self = this;
        if (delimiter == null) {
          delimiter = "."
        }
        if (append == null) {
          append = nil
        }
        ((($a = append) !== false && $a !== nil) ? $a : append = ((function() {if (append['$=='](false)) {
          return ""
          } else {
          return delimiter
        }; return nil; })()));
        if (($a = ($b = ($c = ($d = ($e = self.level['$nil?'](), ($e === nil || $e === false)), $d !== false && $d !== nil ?self.level['$>'](1) : $d), $c !== false && $c !== nil ?($d = self.parent['$nil?'](), ($d === nil || $d === false)) : $c), $b !== false && $b !== nil ?self.parent.$context()['$==']("section") : $b)) !== false && $a !== nil) {
          return "" + (self.parent.$sectnum(delimiter)) + (self.number) + (append)
          } else {
          return "" + (self.number) + (append)
        };
      };

      def['$<<'] = TMP_2 = function(block) {var $zuper = $slice.call(arguments, 0);
        var self = this, $iter = TMP_2._p, $yield = $iter || nil;
        TMP_2._p = null;
        $opal.find_super_dispatcher(self, '<<', TMP_2, $iter).apply(self, $zuper);
        if (block.$context()['$==']("section")) {
          return self.$assign_index(block)
          } else {
          return nil
        };
      };

      return (def.$to_s = TMP_3 = function() {var $zuper = $slice.call(arguments, 0);
        var $a, self = this, $iter = TMP_3._p, $yield = $iter || nil;
        TMP_3._p = null;
        if (($a = self.title) !== false && $a !== nil) {
          if (($a = self.numbered) !== false && $a !== nil) {
            return "" + ($opal.find_super_dispatcher(self, 'to_s', TMP_3, $iter).apply(self, $zuper).$to_s()) + " - " + (self.$sectnum()) + " " + (self.title) + " [blocks:" + (self.blocks.$size()) + "]"
            } else {
            return "" + ($opal.find_super_dispatcher(self, 'to_s', TMP_3, $iter).apply(self, $zuper).$to_s()) + " - " + (self.title) + " [blocks:" + (self.blocks.$size()) + "]"
          }
          } else {
          return $opal.find_super_dispatcher(self, 'to_s', TMP_3, $iter).apply(self, $zuper).$to_s()
        };
      }, nil);
    })(self, $opalScope.AbstractBlock)
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $module = $opal.module, $klass = $opal.klass, $hash2 = $opal.hash2, $range = $opal.range;
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope;
    (function($base, $super) {
      function $Table(){};
      var self = $Table = $klass($base, $super, 'Table', $Table);

      var def = $Table._proto, $opalScope = $Table._scope, TMP_1;
      def.attributes = def.document = def.has_header_option = def.rows = def.columns = nil;
      (function($base, $super) {
        function $Rows(){};
        var self = $Rows = $klass($base, $super, 'Rows', $Rows);

        var def = $Rows._proto, $opalScope = $Rows._scope;
        self.$attr_accessor("head", "foot", "body");

        def.$initialize = function(head, foot, body) {
          var self = this;
          if (head == null) {
            head = []
          }
          if (foot == null) {
            foot = []
          }
          if (body == null) {
            body = []
          }
          self.head = head;
          self.foot = foot;
          return self.body = body;
        };

        return (def['$[]'] = function(name) {
          var self = this;
          return self.$send(name);
        }, nil);
      })(self, null);

      $opal.cdecl($opalScope, 'DEFAULT_DATA_FORMAT', "psv");

      $opal.cdecl($opalScope, 'DATA_FORMATS', ["psv", "dsv", "csv"]);

      $opal.cdecl($opalScope, 'DEFAULT_DELIMITERS', $hash2(["psv", "dsv", "csv"], {"psv": "|", "dsv": ":", "csv": ","}));

      $opal.cdecl($opalScope, 'TEXT_STYLES', $hash2(["d", "s", "e", "m", "h", "l", "v", "a"], {"d": "none", "s": "strong", "e": "emphasis", "m": "monospaced", "h": "header", "l": "literal", "v": "verse", "a": "asciidoc"}));

      $opal.cdecl($opalScope, 'ALIGNMENTS', $hash2(["h", "v"], {"h": $hash2(["<", ">", "^"], {"<": "left", ">": "right", "^": "center"}), "v": $hash2(["<", ">", "^"], {"<": "top", ">": "bottom", "^": "middle"})}));

      self.$attr_accessor("columns");

      self.$attr_accessor("rows");

      self.$attr_accessor("has_header_option");

      def.$initialize = TMP_1 = function(parent, attributes) {
        var $a, $b, $c, $d, self = this, $iter = TMP_1._p, $yield = $iter || nil, pcwidth = nil, pcwidth_intval = nil;
        TMP_1._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_1, null).apply(self, [parent, "table"]);
        self.rows = $opalScope.Rows.$new();
        self.columns = [];
        self.has_header_option = attributes['$has_key?']("header-option");
        pcwidth = attributes['$[]']("width");
        pcwidth_intval = pcwidth.$to_i().$abs();
        if (($a = ((($b = (($c = pcwidth_intval['$=='](0)) ? ($d = pcwidth['$==']("0"), ($d === nil || $d === false)) : $c)) !== false && $b !== nil) ? $b : pcwidth_intval['$>'](100))) !== false && $a !== nil) {
          pcwidth_intval = 100};
        self.attributes['$[]=']("tablepcwidth", pcwidth_intval);
        if (($a = self.document.$attributes()['$has_key?']("pagewidth")) !== false && $a !== nil) {
          return ($a = "tableabswidth", $b = self.attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, ((self.attributes['$[]']("tablepcwidth").$to_f()['$/'](100))['$*'](self.document.$attributes()['$[]']("pagewidth"))).$round())))
          } else {
          return nil
        };
      };

      def['$header_row?'] = function() {
        var $a, self = this;
        return ($a = self.has_header_option, $a !== false && $a !== nil ?self.rows.$body().$size()['$=='](0) : $a);
      };

      def.$create_columns = function(col_specs) {
        var $a, $b, TMP_2, $c, TMP_3, self = this, total_width = nil, even_width = nil;
        total_width = 0;
        self.columns = ($a = ($b = col_specs).$opalInject, $a._p = (TMP_2 = function(collector, col_spec){var self = TMP_2._s || this;if (collector == null) collector = nil;if (col_spec == null) col_spec = nil;
        total_width = total_width['$+'](col_spec['$[]']("width"));
          collector['$<<']($opalScope.Column.$new(self, collector.$size(), col_spec));
          return collector;}, TMP_2._s = self, TMP_2), $a).call($b, []);
        if (($a = ($c = self.columns['$empty?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
          self.attributes['$[]=']("colcount", self.columns.$size());
          even_width = ((100.0)['$/'](self.columns.$size())).$floor();
          ($a = ($c = self.columns).$each, $a._p = (TMP_3 = function(c){var self = TMP_3._s || this;if (c == null) c = nil;
          return c.$assign_width(total_width, even_width)}, TMP_3._s = self, TMP_3), $a).call($c);};
        return nil;
      };

      return (def.$partition_header_footer = function(attributes) {
        var $a, $b, $c, TMP_4, $d, self = this, head = nil;
        self.attributes['$[]=']("rowcount", self.rows.$body().$size());
        if (($a = ($b = ($c = self.rows.$body()['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?self.has_header_option : $b)) !== false && $a !== nil) {
          head = self.rows.$body().$shift();
          ($a = ($b = head).$each, $a._p = (TMP_4 = function(c){var self = TMP_4._s || this;if (c == null) c = nil;
          return c['$style='](nil)}, TMP_4._s = self, TMP_4), $a).call($b);
          self.rows['$head=']([head]);};
        if (($a = ($c = ($d = self.rows.$body()['$empty?'](), ($d === nil || $d === false)), $c !== false && $c !== nil ?attributes['$has_key?']("footer-option") : $c)) !== false && $a !== nil) {
          self.rows['$foot=']([self.rows.$body().$pop()])};
        return nil;
      }, nil);
    })(self, $opalScope.AbstractBlock);

    (function($base, $super) {
      function $Column(){};
      var self = $Column = $klass($base, $super, 'Column', $Column);

      var def = $Column._proto, $opalScope = $Column._scope, TMP_5;
      def.attributes = nil;
      self.$attr_accessor("style");

      def.$initialize = TMP_5 = function(table, index, attributes) {
        var $a, $b, $c, self = this, $iter = TMP_5._p, $yield = $iter || nil;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        TMP_5._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_5, null).apply(self, [table, "column"]);
        self.style = attributes['$[]']("style");
        attributes['$[]=']("colnumber", index['$+'](1));
        ($a = "width", $b = attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 1)));
        ($a = "halign", $b = attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, "left")));
        ($a = "valign", $b = attributes, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, "top")));
        return self.$update_attributes(attributes);
      };

      $opal.defn(self, '$table', def.$parent);

      return (def.$assign_width = function(total_width, even_width) {
        var $a, self = this, width = nil;
        if (total_width['$>'](0)) {
          width = ((self.attributes['$[]']("width").$to_f()['$/'](total_width))['$*'](100)).$floor()
          } else {
          width = even_width
        };
        self.attributes['$[]=']("colpcwidth", width);
        if (($a = self.$parent().$attributes()['$has_key?']("tableabswidth")) !== false && $a !== nil) {
          self.attributes['$[]=']("colabswidth", ((width.$to_f()['$/'](100))['$*'](self.$parent().$attributes()['$[]']("tableabswidth"))).$round())};
        return nil;
      }, nil);
    })($opalScope.Table, $opalScope.AbstractNode);

    (function($base, $super) {
      function $Cell(){};
      var self = $Cell = $klass($base, $super, 'Cell', $Cell);

      var def = $Cell._proto, $opalScope = $Cell._scope, TMP_6, TMP_8;
      def.style = def.document = def.text = def.inner_document = def.colspan = def.rowspan = def.attributes = nil;
      self.$attr_accessor("style");

      self.$attr_accessor("colspan");

      self.$attr_accessor("rowspan");

      $opal.defn(self, '$column', def.$parent);

      self.$attr_reader("inner_document");

      def.$initialize = TMP_6 = function(column, text, attributes, cursor) {
        var $a, $b, $c, self = this, $iter = TMP_6._p, $yield = $iter || nil, parent_doctitle = nil, inner_document_lines = nil, unprocessed_lines = nil, processed_lines = nil;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        if (cursor == null) {
          cursor = nil
        }
        TMP_6._p = null;
        $opal.find_super_dispatcher(self, 'initialize', TMP_6, null).apply(self, [column, "cell"]);
        self.text = text;
        self.style = nil;
        self.colspan = nil;
        self.rowspan = nil;
        if (($a = ($b = column['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          self.style = column.$attributes()['$[]']("style");
          self.$update_attributes(column.$attributes());};
        if (($a = ($b = attributes['$nil?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
          self.colspan = attributes.$delete("colspan");
          self.rowspan = attributes.$delete("rowspan");
          if (($a = attributes['$has_key?']("style")) !== false && $a !== nil) {
            self.style = attributes['$[]']("style")};
          self.$update_attributes(attributes);};
        if (($a = (($b = self.style['$==']("asciidoc")) ? ($c = column.$table()['$header_row?'](), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
          parent_doctitle = self.document.$attributes().$delete("doctitle");
          inner_document_lines = self.text.$split($opalScope.LINE_SPLIT);
          if (($a = ((($b = inner_document_lines['$empty?']()) !== false && $b !== nil) ? $b : ($c = inner_document_lines.$first()['$include?']("::"), ($c === nil || $c === false)))) === false || $a === nil) {
            unprocessed_lines = inner_document_lines['$[]']($range(0, 0, false));
            processed_lines = $opalScope.PreprocessorReader.$new(self.document, unprocessed_lines).$readlines();
            if (($a = ($b = processed_lines['$=='](unprocessed_lines), ($b === nil || $b === false))) !== false && $a !== nil) {
              inner_document_lines.$shift();
              ($a = inner_document_lines).$unshift.apply($a, [].concat(processed_lines));};};
          self.inner_document = $opalScope.Document.$new(inner_document_lines, $hash2(["header_footer", "parent", "cursor"], {"header_footer": false, "parent": self.document, "cursor": cursor}));
          if (($b = parent_doctitle['$nil?']()) !== false && $b !== nil) {
            return nil
            } else {
            return self.document.$attributes()['$[]=']("doctitle", parent_doctitle)
          };
          } else {
          return nil
        };
      };

      def.$text = function() {
        var self = this;
        return self.$apply_normal_subs(self.text).$strip();
      };

      def.$content = function() {
        var $a, $b, TMP_7, self = this;
        if (self.style['$==']("asciidoc")) {
          return self.inner_document.$render()
          } else {
          return ($a = ($b = self.$text().$split($opalScope.BLANK_LINE_PATTERN)).$map, $a._p = (TMP_7 = function(p){var self = TMP_7._s || this, $a, $b, $c;
            if (self.style == null) self.style = nil;
if (p == null) p = nil;
          if (($a = ((($b = ($c = self.style, ($c === nil || $c === false))) !== false && $b !== nil) ? $b : self.style['$==']("header"))) !== false && $a !== nil) {
              return p
              } else {
              return $opalScope.Inline.$new(self.$parent(), "quoted", p, $hash2(["type"], {"type": self.style})).$render()
            }}, TMP_7._s = self, TMP_7), $a).call($b)
        };
      };

      return (def.$to_s = TMP_8 = function() {var $zuper = $slice.call(arguments, 0);
        var $a, self = this, $iter = TMP_8._p, $yield = $iter || nil;
        TMP_8._p = null;
        return "" + ($opal.find_super_dispatcher(self, 'to_s', TMP_8, $iter).apply(self, $zuper).$to_s()) + " - [text: " + (self.text) + ", colspan: " + (((($a = self.colspan) !== false && $a !== nil) ? $a : 1)) + ", rowspan: " + (((($a = self.rowspan) !== false && $a !== nil) ? $a : 1)) + ", attributes: " + (self.attributes) + "]";
      }, nil);
    })($opalScope.Table, $opalScope.AbstractNode);

    (function($base, $super) {
      function $ParserContext(){};
      var self = $ParserContext = $klass($base, $super, 'ParserContext', $ParserContext);

      var def = $ParserContext._proto, $opalScope = $ParserContext._scope;
      def.format = def.delimiter = def.delimiter_re = def.buffer = def.cell_specs = def.cell_open = def.last_cursor = def.table = def.current_row = def.col_count = def.col_visits = def.active_rowspans = def.linenum = nil;
      self.$attr_accessor("table");

      self.$attr_accessor("format");

      self.$attr_reader("col_count");

      self.$attr_accessor("buffer");

      self.$attr_reader("delimiter");

      self.$attr_reader("delimiter_re");

      def.$initialize = function(reader, table, attributes) {
        var $a, $b, $c, $d, self = this;
        if (attributes == null) {
          attributes = $hash2([], {})
        }
        self.reader = reader;
        self.table = table;
        self.last_cursor = reader.$cursor();
        if (($a = attributes['$has_key?']("format")) !== false && $a !== nil) {
          self.format = attributes['$[]']("format");
          if (($a = ($b = ($opalScope.Table)._scope.DATA_FORMATS['$include?'](self.format), ($b === nil || $b === false))) !== false && $a !== nil) {
            self.$raise("Illegal table format: " + (self.format))};
          } else {
          self.format = ($opalScope.Table)._scope.DEFAULT_DATA_FORMAT
        };
        if (($a = ($b = (($c = self.format['$==']("psv")) ? ($d = attributes['$has_key?']("separator"), ($d === nil || $d === false)) : $c), $b !== false && $b !== nil ?table.$document()['$nested?']() : $b)) !== false && $a !== nil) {
          self.delimiter = "!"
          } else {
          self.delimiter = attributes.$fetch("separator", ($opalScope.Table)._scope.DEFAULT_DELIMITERS['$[]'](self.format))
        };
        self.delimiter_re = (new RegExp("" + $opalScope.Regexp.$escape(self.delimiter)));
        self.col_count = (function() {if (($a = table.$columns()['$empty?']()) !== false && $a !== nil) {
          return -1
          } else {
          return table.$columns().$size()
        }; return nil; })();
        self.buffer = "";
        self.cell_specs = [];
        self.cell_open = false;
        self.active_rowspans = [0];
        self.col_visits = 0;
        self.current_row = [];
        return self.linenum = -1;
      };

      def['$starts_with_delimiter?'] = function(line) {
        var self = this;
        return line['$start_with?'](self.delimiter);
      };

      def.$match_delimiter = function(line) {
        var self = this;
        return line.$match(self.delimiter_re);
      };

      def.$skip_matched_delimiter = function(match, escaped) {
        var self = this;
        if (escaped == null) {
          escaped = false
        }
        self.buffer = "" + (self.buffer) + ((function() {if (escaped !== false && escaped !== nil) {
          return match.$pre_match().$chop()
          } else {
          return match.$pre_match()
        }; return nil; })()) + (self.delimiter);
        return match.$post_match();
      };

      def['$buffer_has_unclosed_quotes?'] = function(append) {
        var $a, $b, $c, self = this, record = nil;
        if (append == null) {
          append = nil
        }
        record = ((("") + (self.buffer)) + (append)).$strip();
        return ($a = ($b = record['$start_with?']("\""), $b !== false && $b !== nil ?($c = record['$start_with?']("\"\""), ($c === nil || $c === false)) : $b), $a !== false && $a !== nil ?($b = record['$end_with?']("\""), ($b === nil || $b === false)) : $a);
      };

      def['$buffer_quoted?'] = function() {
        var $a, $b, self = this;
        self.buffer = self.buffer.$lstrip();
        return ($a = self.buffer['$start_with?']("\""), $a !== false && $a !== nil ?($b = self.buffer['$start_with?']("\"\""), ($b === nil || $b === false)) : $a);
      };

      def.$take_cell_spec = function() {
        var self = this;
        return self.cell_specs.$shift();
      };

      def.$push_cell_spec = function(cell_spec) {
        var $a, self = this;
        if (cell_spec == null) {
          cell_spec = $hash2([], {})
        }
        self.cell_specs['$<<']((((($a = cell_spec) !== false && $a !== nil) ? $a : $hash2([], {}))));
        return nil;
      };

      def.$keep_cell_open = function() {
        var self = this;
        self.cell_open = true;
        return nil;
      };

      def.$mark_cell_closed = function() {
        var self = this;
        self.cell_open = false;
        return nil;
      };

      def['$cell_open?'] = function() {
        var self = this;
        return self.cell_open;
      };

      def['$cell_closed?'] = function() {
        var $a, self = this;
        return ($a = self.cell_open, ($a === nil || $a === false));
      };

      def.$close_open_cell = function(next_cell_spec) {
        var $a, self = this;
        if (next_cell_spec == null) {
          next_cell_spec = $hash2([], {})
        }
        self.$push_cell_spec(next_cell_spec);
        if (($a = self['$cell_open?']()) !== false && $a !== nil) {
          self.$close_cell(true)};
        self.$advance();
        return nil;
      };

      def.$close_cell = function(eol) {
        var $a, $b, $c, TMP_9, self = this, cell_text = nil, cell_spec = nil, repeat = nil;
        if (eol == null) {
          eol = false
        }
        cell_text = self.buffer.$strip();
        self.buffer = "";
        if (self.$format()['$==']("psv")) {
          cell_spec = self.$take_cell_spec();
          if (($a = cell_spec['$nil?']()) !== false && $a !== nil) {
            self.$warn("asciidoctor: ERROR: " + (self.last_cursor.$line_info()) + ": table missing leading separator, recovering automatically");
            cell_spec = $hash2([], {});
            repeat = 1;
            } else {
            repeat = cell_spec.$fetch("repeatcol", 1);
            cell_spec.$delete("repeatcol");
          };
          } else {
          cell_spec = nil;
          repeat = 1;
          if (self.$format()['$==']("csv")) {
            if (($a = ($b = ($c = cell_text['$empty?'](), ($c === nil || $c === false)), $b !== false && $b !== nil ?cell_text['$include?']("\"") : $b)) !== false && $a !== nil) {
              if (($a = ($b = cell_text['$start_with?']("\""), $b !== false && $b !== nil ?cell_text['$end_with?']("\"") : $b)) !== false && $a !== nil) {
                cell_text = cell_text['$[]']($range(1, -2, false)).$strip()};
              cell_text = cell_text.$tr_s("\"", "\"");}};
        };
        ($a = ($b = (1)).$upto, $a._p = (TMP_9 = function(i){var self = TMP_9._s || this, $a, $b, $c, $d, $e, column = nil, cell = nil;
          if (self.col_count == null) self.col_count = nil;
          if (self.table == null) self.table = nil;
          if (self.current_row == null) self.current_row = nil;
          if (self.last_cursor == null) self.last_cursor = nil;
          if (self.reader == null) self.reader = nil;
          if (self.col_visits == null) self.col_visits = nil;
          if (self.linenum == null) self.linenum = nil;
if (i == null) i = nil;
        if (self.col_count['$=='](-1)) {
            self.table.$columns()['$<<'](($opalScope.Table)._scope.Column.$new(self.table, self.current_row.$size()['$+'](i)['$-'](1)));
            column = self.table.$columns().$last();
            } else {
            column = self.table.$columns()['$[]'](self.current_row.$size())
          };
          cell = ($opalScope.Table)._scope.Cell.$new(column, cell_text, cell_spec, self.last_cursor);
          self.last_cursor = self.reader.$cursor();
          if (($a = ((($b = cell.$rowspan()['$nil?']()) !== false && $b !== nil) ? $b : cell.$rowspan()['$=='](1))) === false || $a === nil) {
            self.$activate_rowspan(cell.$rowspan(), (((($a = cell.$colspan()) !== false && $a !== nil) ? $a : 1)))};
          self.col_visits = self.col_visits['$+']((((($a = cell.$colspan()) !== false && $a !== nil) ? $a : 1)));
          self.current_row['$<<'](cell);
          if (($a = ($b = self['$end_of_row?'](), $b !== false && $b !== nil ?(((($c = ((($d = ($e = self.col_count['$=='](-1), ($e === nil || $e === false))) !== false && $d !== nil) ? $d : self.linenum['$>'](0))) !== false && $c !== nil) ? $c : ((($d = eol !== false && eol !== nil) ? i['$=='](repeat) : $d)))) : $b)) !== false && $a !== nil) {
            return self.$close_row()
            } else {
            return nil
          };}, TMP_9._s = self, TMP_9), $a).call($b, repeat);
        self.open_cell = false;
        return nil;
      };

      def.$close_row = function() {
        var $a, $b, $c, self = this;
        self.table.$rows().$body()['$<<'](self.current_row);
        if (self.col_count['$=='](-1)) {
          self.col_count = self.col_visits};
        self.col_visits = 0;
        self.current_row = [];
        self.active_rowspans.$shift();
        ($a = 0, $b = self.active_rowspans, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, 0)));
        return nil;
      };

      def.$activate_rowspan = function(rowspan, colspan) {
        var $a, $b, TMP_10, self = this;
        ($a = ($b = (1).$upto(rowspan['$-'](1))).$each, $a._p = (TMP_10 = function(i){var self = TMP_10._s || this, $a;
          if (self.active_rowspans == null) self.active_rowspans = nil;
if (i == null) i = nil;
        return self.active_rowspans['$[]='](i, (((($a = self.active_rowspans['$[]'](i)) !== false && $a !== nil) ? $a : 0))['$+'](colspan))}, TMP_10._s = self, TMP_10), $a).call($b);
        return nil;
      };

      def['$end_of_row?'] = function() {
        var $a, self = this;
        return ((($a = self.col_count['$=='](-1)) !== false && $a !== nil) ? $a : self.$effective_col_visits()['$=='](self.col_count));
      };

      def.$effective_col_visits = function() {
        var self = this;
        return self.col_visits['$+'](self.active_rowspans.$first());
      };

      return (def.$advance = function() {
        var self = this;
        return self.linenum = self.linenum['$+'](1);
      }, nil);
    })($opalScope.Table, null);
    
  })(self)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $hash2 = $opal.hash2;
  return (function($base, $super) {
    function $Template(){};
    var self = $Template = $klass($base, $super, 'Template', $Template);

    var def = $Template._proto, $opalScope = $Template._scope, TMP_1;
    def.name = def.body = nil;
    self._cache = $hash2([], {});

    $opal.defs(self, '$[]', function(name) {
      var self = this;
      if (self._cache == null) self._cache = nil;

      return self._cache['$[]'](name);
    });

    $opal.defs(self, '$[]=', function(name, instance) {
      var self = this;
      if (self._cache == null) self._cache = nil;

      return self._cache['$[]='](name, instance);
    });

    $opal.defs(self, '$paths', function() {
      var self = this;
      if (self._cache == null) self._cache = nil;

      return self._cache.$keys();
    });

    self.$attr_reader("body");

    def.$initialize = TMP_1 = function(name) {
      var $a, self = this, $iter = TMP_1._p, body = $iter || nil;
      TMP_1._p = null;
      $a = [name, body], self.name = $a[0], self.body = $a[1];
      return $opalScope.Template['$[]='](name, self);
    };

    def.$inspect = function() {
      var self = this;
      return "#<Template: '" + (self.name) + "'>";
    };

    def.$render = function(ctx) {
      var $a, $b, self = this;
      if (ctx == null) {
        ctx = self
      }
      return ($a = ($b = ctx).$instance_exec, $a._p = self.body.$to_proc(), $a).call($b, $opalScope.OutputBuffer.$new());
    };

    return (function($base, $super) {
      function $OutputBuffer(){};
      var self = $OutputBuffer = $klass($base, $super, 'OutputBuffer', $OutputBuffer);

      var def = $OutputBuffer._proto, $opalScope = $OutputBuffer._scope;
      def.buffer = nil;
      def.$initialize = function() {
        var self = this;
        return self.buffer = [];
      };

      def.$append = function(str) {
        var self = this;
        return self.buffer['$<<'](str);
      };

      def['$append='] = function(content) {
        var self = this;
        return self.buffer['$<<'](content);
      };

      return (def.$join = function() {
        var self = this;
        return self.buffer.$join();
      }, nil);
    })(self, null);
  })(self, null)
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $klass = $opal.klass, $module = $opal.module;
  ;
  return (function($base, $super) {
    function $ERB(){};
    var self = $ERB = $klass($base, $super, 'ERB', $ERB);

    var def = $ERB._proto, $opalScope = $ERB._scope;
    return (function($base) {
      var self = $module($base, 'Util');

      var def = self._proto, $opalScope = self._scope;
      var escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

      var escape_regexp = /[&<>"']/g;

      def.$html_escape = function(str) {
        var self = this;
        return ("" + str).replace(escape_regexp, function (m) { return escapes[m] });
      };

      $opal.defn(self, '$h', def.$html_escape);

      self.$module_function("h");

      self.$module_function("html_escape");
            ;$opal.donate(self, ["$html_escape", "$h"]);
    })(self)
  })(self, null);
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$attr', '$role', '$attr?', '$icon_uri', '$title?', '$title', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.id == null) self.id = nil;
    if (self.document == null) self.document = nil;
    if (self.caption == null) self.caption = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["admonitionblock", (self.$attr("name")), self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">\n<table>\n<tr>\n<td class=\"icon\">");
    if (($a = self.document['$attr?']("icons", "font")) !== false && $a !== nil) {
      output_buffer.$append("\n<i class=\"icon-");
      output_buffer['$append=']((self.$attr("name")));
      output_buffer.$append("\" title=\"");
      output_buffer['$append=']((self.caption));
      output_buffer.$append("\"></i>");
    } else if (($a = self.document['$attr?']("icons")) !== false && $a !== nil) {
      output_buffer.$append("\n<img src=\"");
      output_buffer['$append=']((self.$icon_uri(self.$attr("name"))));
      output_buffer.$append("\" alt=\"");
      output_buffer['$append=']((self.caption));
      output_buffer.$append("\">");
      } else {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.caption));
      output_buffer.$append("</div>");
    };
    output_buffer.$append("\n</td>\n<td class=\"content\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</td>\n</tr>\n</table>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_admonition")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$captioned_title', '$media_uri', '$attr', '$option?', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["audioblock", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<div class=\"content\">\n<audio src=\"");
    output_buffer['$append=']((self.$media_uri(self.$attr("target"))));
    output_buffer.$append("\"");
    if (($a = self['$option?']("autoplay")) !== false && $a !== nil) {
      output_buffer.$append(" autoplay")};
    if (($a = self['$option?']("nocontrols")) === false || $a === nil) {
      output_buffer.$append(" controls")};
    if (($a = self['$option?']("loop")) !== false && $a !== nil) {
      output_buffer.$append(" loop")};
    output_buffer.$append(">\nYour browser does not support the audio tag.\n</audio>\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_audio")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$attr?', '$each_with_index', '$+', '$icon_uri', '$text', '$items', '$each', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, $c, TMP_3, font_icons = nil;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
    if (self.document == null) self.document = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["colist", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    if (($a = self.document['$attr?']("icons")) !== false && $a !== nil) {
      font_icons = self.document['$attr?']("icons", "font");
      output_buffer.$append("\n<table>");
      ($a = ($b = self.$items()).$each_with_index, $a._p = (TMP_2 = function(item, i){var self = TMP_2._s || this, num = nil;if (item == null) item = nil;if (i == null) i = nil;
      num = i['$+'](1);
        output_buffer.$append("\n<tr>\n<td>");
        if (font_icons !== false && font_icons !== nil) {
          output_buffer.$append("<i class=\"conum\" data-value=\"");
          output_buffer['$append=']((num));
          output_buffer.$append("\"></i><b>");
          output_buffer['$append=']((num));
          output_buffer.$append("</b>");
          } else {
          output_buffer.$append("<img src=\"");
          output_buffer['$append=']((self.$icon_uri("callouts/" + (num))));
          output_buffer.$append("\" alt=\"");
          output_buffer['$append=']((num));
          output_buffer.$append("\">");
        };
        output_buffer.$append("</td>\n<td>");
        output_buffer['$append=']((item.$text()));
        return output_buffer.$append("</td>\n</tr>");}, TMP_2._s = self, TMP_2), $a).call($b);
      output_buffer.$append("\n</table>");
      } else {
      output_buffer.$append("\n<ol>");
      ($a = ($c = self.$items()).$each, $a._p = (TMP_3 = function(item){var self = TMP_3._s || this;if (item == null) item = nil;
      output_buffer.$append("\n<li>\n<p>");
        output_buffer['$append=']((item.$text()));
        return output_buffer.$append("</p>\n</li>");}, TMP_3._s = self, TMP_3), $a).call($c);
      output_buffer.$append("\n</ol>");
    };
    output_buffer.$append("\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_colist")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$===', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$each', '$text', '$nil?', '$text?', '$blocks?', '$content', '$dd', '$items', '$attr?', '$chomp', '$attr', '$option?', '$last', '$==', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, $c, TMP_4, $d, TMP_6, $case = nil;
    if (self.style == null) self.style = nil;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    $case = self.style;if ("qanda"['$===']($case)) {output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["qlist", "qanda", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<ol>");
    ($a = ($b = self.$items()).$each, $a._p = (TMP_2 = function(questions, answer){var self = TMP_2._s || this, $a, $b, TMP_3;if (questions == null) questions = nil;if (answer == null) answer = nil;
    output_buffer.$append("\n<li>");
      ($a = ($b = [].concat(questions)).$each, $a._p = (TMP_3 = function(question){var self = TMP_3._s || this;if (question == null) question = nil;
      output_buffer.$append("\n<p><em>");
        output_buffer['$append=']((question.$text()));
        return output_buffer.$append("</em></p>");}, TMP_3._s = self, TMP_3), $a).call($b);
      if (($a = answer['$nil?']()) === false || $a === nil) {
        if (($a = answer['$text?']()) !== false && $a !== nil) {
          output_buffer.$append("\n<p>");
          output_buffer['$append=']((answer.$text()));
          output_buffer.$append("</p>");};
        if (($a = answer['$blocks?']()) !== false && $a !== nil) {
          output_buffer.$append("\n");
          output_buffer['$append=']((self.$dd().$content()));
          output_buffer.$append("");};};
      return output_buffer.$append("\n</li>");}, TMP_2._s = self, TMP_2), $a).call($b);
    output_buffer.$append("\n</ol>\n</div>");}else if ("horizontal"['$===']($case)) {output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["hdlist", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<table>");
    if (($a = ((($c = (self['$attr?']("labelwidth"))) !== false && $c !== nil) ? $c : (self['$attr?']("itemwidth")))) !== false && $a !== nil) {
      output_buffer.$append("\n<colgroup>\n<col");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("labelwidth"))) !== false && $a !== nil) {
        return " style=\"width: " + ((self.$attr("labelwidth")).$chomp("%")) + "%;\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append(">\n<col");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("itemwidth"))) !== false && $a !== nil) {
        return " style=\"width: " + ((self.$attr("itemwidth")).$chomp("%")) + "%;\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append(">\n</colgroup>");};
    ($a = ($c = self.$items()).$each, $a._p = (TMP_4 = function(terms, dd){var self = TMP_4._s || this, $a, $b, TMP_5, last_term = nil;if (terms == null) terms = nil;if (dd == null) dd = nil;
    output_buffer.$append("\n<tr>\n<td class=\"hdlist1");
      output_buffer['$append='](((function() {if (($a = (self['$option?']("strong"))) !== false && $a !== nil) {
        return " strong"
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append("\">");
      terms = [].concat(terms);
      last_term = terms.$last();
      ($a = ($b = terms).$each, $a._p = (TMP_5 = function(dt){var self = TMP_5._s || this, $a, $b;if (dt == null) dt = nil;
      output_buffer.$append("\n");
        output_buffer['$append=']((dt.$text()));
        output_buffer.$append("");
        if (($a = ($b = dt['$=='](last_term), ($b === nil || $b === false))) !== false && $a !== nil) {
          return output_buffer.$append("\n<br>")
          } else {
          return nil
        };}, TMP_5._s = self, TMP_5), $a).call($b);
      output_buffer.$append("\n</td>\n<td class=\"hdlist2\">");
      if (($a = dd['$nil?']()) === false || $a === nil) {
        if (($a = dd['$text?']()) !== false && $a !== nil) {
          output_buffer.$append("\n<p>");
          output_buffer['$append=']((dd.$text()));
          output_buffer.$append("</p>");};
        if (($a = dd['$blocks?']()) !== false && $a !== nil) {
          output_buffer.$append("\n");
          output_buffer['$append=']((dd.$content()));
          output_buffer.$append("");};};
      return output_buffer.$append("\n</td>\n</tr>");}, TMP_4._s = self, TMP_4), $a).call($c);
    output_buffer.$append("\n</table>\n</div>");}else {output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["dlist", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<dl>");
    ($a = ($d = self.$items()).$each, $a._p = (TMP_6 = function(terms, dd){var self = TMP_6._s || this, $a, $b, TMP_7;if (terms == null) terms = nil;if (dd == null) dd = nil;
    ($a = ($b = [].concat(terms)).$each, $a._p = (TMP_7 = function(dt){var self = TMP_7._s || this, $a, $b;
        if (self.style == null) self.style = nil;
if (dt == null) dt = nil;
      output_buffer.$append("\n<dt");
        output_buffer['$append='](((function() {if (($a = ($b = self.style, ($b === nil || $b === false))) !== false && $a !== nil) {
          return " class=\"hdlist1\""
          } else {
          return nil
        }; return nil; })()));
        output_buffer.$append(">");
        output_buffer['$append=']((dt.$text()));
        return output_buffer.$append("</dt>");}, TMP_7._s = self, TMP_7), $a).call($b);
      if (($a = dd['$nil?']()) !== false && $a !== nil) {
        return nil
        } else {
        output_buffer.$append("\n<dd>");
        if (($a = dd['$text?']()) !== false && $a !== nil) {
          output_buffer.$append("\n<p>");
          output_buffer['$append=']((dd.$text()));
          output_buffer.$append("</p>");};
        if (($a = dd['$blocks?']()) !== false && $a !== nil) {
          output_buffer.$append("\n");
          output_buffer['$append=']((dd.$content()));
          output_buffer.$append("");};
        return output_buffer.$append("\n</dd>");
      };}, TMP_6._s = self, TMP_6), $a).call($d);
    output_buffer.$append("\n</dl>\n</div>");};
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_dlist")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$captioned_title', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["exampleblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<div class=\"content\">\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_example")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$+', '$*', '$compact', '$role', '$title', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.level == null) self.level = nil;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    output_buffer['$append='](("<h" + (self.level['$+'](1)) + (($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)) + " class=\"" + ([self.style, self.$role()].$compact()['$*'](" ")) + "\">" + (self.$title()) + "</h" + (self.level['$+'](1)) + ">"));
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_floating_title")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$attr?', '$attr', '$image_uri', '$title?', '$captioned_title', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["imageblock", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\"");
    if (($a = ((($b = (self['$attr?']("align"))) !== false && $b !== nil) ? $b : (self['$attr?']("float")))) !== false && $a !== nil) {
      output_buffer.$append(" style=\"");
      output_buffer['$append='](([((function() {if (($a = self['$attr?']("align")) !== false && $a !== nil) {
        return "text-align: " + (self.$attr("align")) + ";"
        } else {
        return nil
      }; return nil; })()), ((function() {if (($a = self['$attr?']("float")) !== false && $a !== nil) {
        return "float: " + (self.$attr("float")) + ";"
        } else {
        return nil
      }; return nil; })())].$compact()['$*'](" ")));
      output_buffer.$append("\"");};
    output_buffer.$append(">\n<div class=\"content\">");
    if (($a = self['$attr?']("link")) !== false && $a !== nil) {
      output_buffer.$append("\n<a class=\"image\" href=\"");
      output_buffer['$append=']((self.$attr("link")));
      output_buffer.$append("\"><img src=\"");
      output_buffer['$append=']((self.$image_uri(self.$attr("target"))));
      output_buffer.$append("\" alt=\"");
      output_buffer['$append=']((self.$attr("alt")));
      output_buffer.$append("\"");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("width"))) !== false && $a !== nil) {
        return " width=\"" + (self.$attr("width")) + "\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append("");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("height"))) !== false && $a !== nil) {
        return " height=\"" + (self.$attr("height")) + "\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append("></a>");
      } else {
      output_buffer.$append("\n<img src=\"");
      output_buffer['$append=']((self.$image_uri(self.$attr("target"))));
      output_buffer.$append("\" alt=\"");
      output_buffer['$append=']((self.$attr("alt")));
      output_buffer.$append("\"");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("width"))) !== false && $a !== nil) {
        return " width=\"" + (self.$attr("width")) + "\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append("");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("height"))) !== false && $a !== nil) {
        return " height=\"" + (self.$attr("height")) + "\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append(">");
    };
    output_buffer.$append("\n</div>");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_image")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$captioned_title', '$attr?', '$option?', '$==', '$attr', '$===', '$<<', '$empty?', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, nowrap = nil, language = nil, code_class = nil, pre_class = nil, pre_lang = nil, $case = nil;
    if (self.id == null) self.id = nil;
    if (self.document == null) self.document = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["listingblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<div class=\"content\">");
    nowrap = ((($a = ($b = (self.document['$attr?']("prewrap")), ($b === nil || $b === false))) !== false && $a !== nil) ? $a : (self['$option?']("nowrap")));
    if (self.style['$==']("source")) {
      language = self.$attr("language");
      code_class = (function() {if (language !== false && language !== nil) {
        return [language, "language-" + (language)]
        } else {
        return []
      }; return nil; })();
      pre_class = ["highlight"];
      pre_lang = nil;
      $case = self.$attr("source-highlighter");if ("coderay"['$===']($case)) {pre_class = ["CodeRay"]}else if ("pygments"['$===']($case)) {pre_class = ["pygments", "highlight"]}else if ("prettify"['$===']($case)) {pre_class = ["prettyprint"];
      if (($a = self['$attr?']("linenums")) !== false && $a !== nil) {
        pre_class['$<<']("linenums")};
      if (language !== false && language !== nil) {
        pre_class['$<<'](language)};
      if (language !== false && language !== nil) {
        pre_class['$<<']("language-" + (language))};
      code_class = [];}else if ("html-pipeline"['$===']($case)) {pre_lang = language;
      pre_class = code_class = [];
      nowrap = false;};
      if (nowrap !== false && nowrap !== nil) {
        pre_class['$<<']("nowrap")};
      output_buffer.$append("\n<pre");
      output_buffer['$append='](((function() {if (($a = pre_class['$empty?']()) !== false && $a !== nil) {
        return nil
        } else {
        return " class=\"" + (pre_class['$*'](" ")) + "\""
      }; return nil; })()));
      output_buffer.$append("");
      output_buffer['$append='](((($a = pre_lang !== false && pre_lang !== nil) ? " lang=\"" + (pre_lang) + "\"" : $a)));
      output_buffer.$append("><code");
      output_buffer['$append='](((function() {if (($a = code_class['$empty?']()) !== false && $a !== nil) {
        return nil
        } else {
        return " class=\"" + (code_class['$*'](" ")) + "\""
      }; return nil; })()));
      output_buffer.$append(">");
      output_buffer['$append=']((self.$content()));
      output_buffer.$append("</code></pre>");
      } else {
      output_buffer.$append("\n<pre");
      output_buffer['$append='](((function() {if (nowrap !== false && nowrap !== nil) {
        return " class=\"nowrap\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append(">");
      output_buffer['$append=']((self.$content()));
      output_buffer.$append("</pre>");
    };
    output_buffer.$append("\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_listing")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$attr?', '$option?', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c;
    if (self.id == null) self.id = nil;
    if (self.document == null) self.document = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["literalblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<div class=\"content\">\n<pre");
    output_buffer['$append='](((function() {if (($a = ((($b = ($c = (self.document['$attr?']("prewrap")), ($c === nil || $c === false))) !== false && $b !== nil) ? $b : (self['$option?']("nowrap")))) !== false && $a !== nil) {
      return " class=\"nowrap\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(">");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("</pre>\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_literal")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$attr?', '$attr', '$list_marker_keyword', '$each', '$text', '$blocks?', '$content', '$items', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, keyword = nil;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["olist", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<ol class=\"");
    output_buffer['$append=']((self.style));
    output_buffer.$append("\"");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("start"))) !== false && $a !== nil) {
      return " start=\"" + (self.$attr("start")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("");
    output_buffer['$append=']((($a = (keyword = self.$list_marker_keyword()), $a !== false && $a !== nil ?" type=\"" + (keyword) + "\"" : $a)));
    output_buffer.$append(">");
    ($a = ($b = self.$items()).$each, $a._p = (TMP_2 = function(item){var self = TMP_2._s || this, $a;if (item == null) item = nil;
    output_buffer.$append("\n<li>\n<p>");
      output_buffer['$append=']((item.$text()));
      output_buffer.$append("</p>");
      if (($a = item['$blocks?']()) !== false && $a !== nil) {
        output_buffer.$append("\n");
        output_buffer['$append=']((item.$content()));
        output_buffer.$append("");};
      return output_buffer.$append("\n</li>");}, TMP_2._s = self, TMP_2), $a).call($b);
    output_buffer.$append("\n</ol>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_olist")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$==', '$doctype', '$puts', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$content', '$context', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, $d, $e;
    if (self.style == null) self.style = nil;
    if (self.parent == null) self.parent = nil;
    if (self.document == null) self.document = nil;
    if (self.id == null) self.id = nil;
    if (self.level == null) self.level = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    if (self.style['$==']("abstract")) {
      if (($a = (($b = self.parent['$=='](self.document)) ? self.document.$doctype()['$==']("book") : $b)) !== false && $a !== nil) {
        self.$puts("asciidoctor: WARNING: abstract block cannot be used in a document without a title when doctype is book. Excluding block content.")
        } else {
        output_buffer.$append("<div");
        output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
        output_buffer.$append(" class=\"");
        output_buffer['$append=']((["quoteblock", "abstract", self.$role()].$compact()['$*'](" ")));
        output_buffer.$append("\">");
        if (($a = self['$title?']()) !== false && $a !== nil) {
          output_buffer.$append("\n<div class=\"title\">");
          output_buffer['$append=']((self.$title()));
          output_buffer.$append("</div>");};
        output_buffer.$append("\n<blockquote>\n");
        output_buffer['$append=']((self.$content()));
        output_buffer.$append("\n</blockquote>\n</div>");
      }
    } else if (($a = (($b = self.style['$==']("partintro")) ? (((($c = ((($d = ($e = self.level['$=='](0), ($e === nil || $e === false))) !== false && $d !== nil) ? $d : ($e = self.parent.$context()['$==']("section"), ($e === nil || $e === false)))) !== false && $c !== nil) ? $c : ($d = self.document.$doctype()['$==']("book"), ($d === nil || $d === false)))) : $b)) !== false && $a !== nil) {
      self.$puts("asciidoctor: ERROR: partintro block can only be used when doctype is book and it's a child of a book part. Excluding block content.")
      } else {
      output_buffer.$append("<div");
      output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
      output_buffer.$append(" class=\"");
      output_buffer['$append=']((["openblock", ((function() {if (self.style['$==']("open")) {
        return nil
        } else {
        return self.style
      }; return nil; })()), self.$role()].$compact()['$*'](" ")));
      output_buffer.$append("\">");
      if (($a = self['$title?']()) !== false && $a !== nil) {
        output_buffer.$append("\n<div class=\"title\">");
        output_buffer['$append=']((self.$title()));
        output_buffer.$append("</div>");};
      output_buffer.$append("\n<div class=\"content\">\n");
      output_buffer['$append=']((self.$content()));
      output_buffer.$append("\n</div>\n</div>");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_open")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("<div style=\"page-break-after: always;\"></div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_page_break")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["paragraph", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<p>");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("</p>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_paragraph")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_pass")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$content', '$attr?', '$attr', '$outline', '$to_i', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b;
    if (self.document == null) self.document = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div id=\"preamble\">\n<div class=\"sectionbody\">\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</div>");
    if (($a = ($b = (self['$attr?']("toc")), $b !== false && $b !== nil ?(self['$attr?']("toc-placement", "preamble")) : $b)) !== false && $a !== nil) {
      output_buffer.$append("\n<div id=\"toc\" class=\"");
      output_buffer['$append=']((self.$attr("toc-class", "toc")));
      output_buffer.$append("\">\n<div id=\"toctitle\">");
      output_buffer['$append=']((self.$attr("toc-title")));
      output_buffer.$append("</div>\n");
      output_buffer['$append='](((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5)._scope.DocumentTemplate.$outline(self.document, (self.$attr("toclevels", 2)).$to_i())));
      output_buffer.$append("\n</div>");};
    output_buffer.$append("\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_preamble")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$content', '$attr?', '$attr', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["quoteblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<blockquote>\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</blockquote>");
    if (($a = ((($b = (self['$attr?']("attribution"))) !== false && $b !== nil) ? $b : (self['$attr?']("citetitle")))) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"attribution\">");
      if (($a = self['$attr?']("citetitle")) !== false && $a !== nil) {
        output_buffer.$append("\n<cite>");
        output_buffer['$append=']((self.$attr("citetitle")));
        output_buffer.$append("</cite>");};
      if (($a = self['$attr?']("attribution")) !== false && $a !== nil) {
        if (($a = self['$attr?']("citetitle")) !== false && $a !== nil) {
          output_buffer.$append("<br>")};
        output_buffer.$append("\n");
        output_buffer['$append='](("&#8212; " + (self.$attr("attribution"))));
        output_buffer.$append("");};
      output_buffer.$append("\n</div>");};
    output_buffer.$append("\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_quote")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("<hr>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_ruler")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$content', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["sidebarblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">\n<div class=\"content\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_sidebar")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$attr', '$role', '$attr?', '$option?', '$title?', '$captioned_title', '$zero?', '$times', '$size', '$each', '$==', '$text', '$style', '$===', '$content', '$colspan', '$rowspan', '$[]', '$select', '$empty?', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, TMP_2, TMP_3, $d, TMP_4, $e, $f, TMP_9;
    if (self.id == null) self.id = nil;
    if (self.columns == null) self.columns = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<table");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["tableblock", "frame-" + (self.$attr("frame", "all")), "grid-" + (self.$attr("grid", "all")), self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\"");
    if (($a = ((($b = (self['$attr?']("float"))) !== false && $b !== nil) ? $b : ($c = (self['$option?']("autowidth")), ($c === nil || $c === false)))) !== false && $a !== nil) {
      output_buffer.$append(" style=\"");
      output_buffer['$append='](([((function() {if (($a = self['$option?']("autowidth")) !== false && $a !== nil) {
        return nil
        } else {
        return "width: " + (self.$attr("tablepcwidth")) + "%;"
      }; return nil; })()), ((function() {if (($a = self['$attr?']("float")) !== false && $a !== nil) {
        return "float: " + (self.$attr("float")) + ";"
        } else {
        return nil
      }; return nil; })())].$compact()['$*'](" ")));
      output_buffer.$append("\"");};
    output_buffer.$append(">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<caption class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</caption>");};
    if (($a = (self.$attr("rowcount"))['$zero?']()) === false || $a === nil) {
      output_buffer.$append("\n<colgroup>");
      if (($a = self['$option?']("autowidth")) !== false && $a !== nil) {
        ($a = ($b = self.columns.$size()).$times, $a._p = (TMP_2 = function(){var self = TMP_2._s || this;
        return output_buffer.$append("\n<col>")}, TMP_2._s = self, TMP_2), $a).call($b)
        } else {
        ($a = ($c = self.columns).$each, $a._p = (TMP_3 = function(col){var self = TMP_3._s || this;if (col == null) col = nil;
        output_buffer.$append("\n<col style=\"width: ");
          output_buffer['$append=']((col.$attr("colpcwidth")));
          return output_buffer.$append("%;\">");}, TMP_3._s = self, TMP_3), $a).call($c)
      };
      output_buffer.$append("\n</colgroup>");
      ($a = ($d = ($e = ($f = ["head", "foot", "body"]).$select, $e._p = (TMP_9 = function(tsec){var self = TMP_9._s || this, $a;
        if (self.rows == null) self.rows = nil;
if (tsec == null) tsec = nil;
      return ($a = self.rows['$[]'](tsec)['$empty?'](), ($a === nil || $a === false))}, TMP_9._s = self, TMP_9), $e).call($f)).$each, $a._p = (TMP_4 = function(tsec){var self = TMP_4._s || this, $a, $b, TMP_5;
        if (self.rows == null) self.rows = nil;
if (tsec == null) tsec = nil;
      output_buffer.$append("\n<t");
        output_buffer['$append=']((tsec));
        output_buffer.$append(">");
        ($a = ($b = self.rows['$[]'](tsec)).$each, $a._p = (TMP_5 = function(row){var self = TMP_5._s || this, $a, $b, TMP_6;if (row == null) row = nil;
        output_buffer.$append("\n<tr>");
          ($a = ($b = row).$each, $a._p = (TMP_6 = function(cell){var self = TMP_6._s || this, $a, $b, TMP_7, $c, TMP_8, cell_content = nil, $case = nil, cell_css_style = nil;
            if (self.document == null) self.document = nil;
if (cell == null) cell = nil;
          if (tsec['$==']("head")) {
              cell_content = cell.$text()
              } else {
              $case = cell.$style();if ("verse"['$===']($case) || "literal"['$===']($case)) {cell_content = cell.$text()}else {cell_content = cell.$content()}
            };
            cell_css_style = (function() {if (($a = (self.document['$attr?']("cellbgcolor"))) !== false && $a !== nil) {
              return "background-color: " + (self.document.$attr("cellbgcolor")) + ";"
              } else {
              return nil
            }; return nil; })();
            output_buffer.$append("\n<");
            output_buffer['$append='](((function() {if (tsec['$==']("head")) {
              return "th"
              } else {
              return "td"
            }; return nil; })()));
            output_buffer.$append(" class=\"");
            output_buffer['$append=']((["tableblock", "halign-" + (cell.$attr("halign")), "valign-" + (cell.$attr("valign"))]['$*'](" ")));
            output_buffer.$append("\"");
            output_buffer['$append='](((function() {if (($a = cell.$colspan()) !== false && $a !== nil) {
              return " colspan=\"" + (cell.$colspan()) + "\""
              } else {
              return nil
            }; return nil; })()));
            output_buffer.$append("");
            output_buffer['$append='](((function() {if (($a = cell.$rowspan()) !== false && $a !== nil) {
              return " rowspan=\"" + (cell.$rowspan()) + "\""
              } else {
              return nil
            }; return nil; })()));
            output_buffer.$append("");
            output_buffer['$append='](((function() {if (cell_css_style !== false && cell_css_style !== nil) {
              return " style=\"" + (cell_css_style) + "\""
              } else {
              return nil
            }; return nil; })()));
            output_buffer.$append(">");
            if (tsec['$==']("head")) {
              output_buffer.$append("");
              output_buffer['$append=']((cell_content));
              output_buffer.$append("");
              } else {
              $case = cell.$style();if ("asciidoc"['$===']($case)) {output_buffer.$append("<div>");
              output_buffer['$append=']((cell_content));
              output_buffer.$append("</div>");}else if ("verse"['$===']($case)) {output_buffer.$append("<div class=\"verse\">");
              output_buffer['$append=']((cell_content));
              output_buffer.$append("</div>");}else if ("literal"['$===']($case)) {output_buffer.$append("<div class=\"literal\"><pre>");
              output_buffer['$append=']((cell_content));
              output_buffer.$append("</pre></div>");}else if ("header"['$===']($case)) {($a = ($b = cell_content).$each, $a._p = (TMP_7 = function(text){var self = TMP_7._s || this;if (text == null) text = nil;
              output_buffer.$append("<p class=\"tableblock header\">");
                output_buffer['$append=']((text));
                return output_buffer.$append("</p>");}, TMP_7._s = self, TMP_7), $a).call($b)}else {($a = ($c = cell_content).$each, $a._p = (TMP_8 = function(text){var self = TMP_8._s || this;if (text == null) text = nil;
              output_buffer.$append("<p class=\"tableblock\">");
                output_buffer['$append=']((text));
                return output_buffer.$append("</p>");}, TMP_8._s = self, TMP_8), $a).call($c)}
            };
            output_buffer.$append("</");
            output_buffer['$append='](((function() {if (tsec['$==']("head")) {
              return "th"
              } else {
              return "td"
            }; return nil; })()));
            return output_buffer.$append(">");}, TMP_6._s = self, TMP_6), $a).call($b);
          return output_buffer.$append("\n</tr>");}, TMP_5._s = self, TMP_5), $a).call($b);
        output_buffer.$append("\n</t");
        output_buffer['$append=']((tsec));
        return output_buffer.$append(">");}, TMP_4._s = self, TMP_4), $a).call($d);};
    output_buffer.$append("\n</table>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_table")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$attr?', '$attr', '$title?', '$title', '$to_i', '$embedded?', '$append=', '$outline', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, $d, toc_id = nil, toc_role = nil, toc_title_id = nil, toc_title = nil, toc_levels = nil;
    if (self.document == null) self.document = nil;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    if (($a = self.document['$attr?']("toc")) !== false && $a !== nil) {
      toc_id = self.id;
      toc_role = (self.$attr("role", (self.document.$attr("toc-class", "toc"))));
      toc_title_id = nil;
      toc_title = (function() {if (($a = self['$title?']()) !== false && $a !== nil) {
        return self.$title()
        } else {
        return (self.document.$attr("toc-title"))
      }; return nil; })();
      toc_levels = (function() {if (($a = (self['$attr?']("levels"))) !== false && $a !== nil) {
        return (self.$attr("levels")).$to_i()
        } else {
        return (self.document.$attr("toclevels", 2)).$to_i()
      }; return nil; })();
      if (($a = ($b = ($c = toc_id, ($c === nil || $c === false)), $b !== false && $b !== nil ?(((($c = self.document['$embedded?']()) !== false && $c !== nil) ? $c : ($d = (self.document['$attr?']("toc-placement")), ($d === nil || $d === false)))) : $b)) !== false && $a !== nil) {
        toc_id = "toc";
        toc_title_id = "toctitle";};
      output_buffer.$append("<div");
      output_buffer['$append='](((($a = toc_id !== false && toc_id !== nil) ? " id=\"" + (toc_id) + "\"" : $a)));
      output_buffer.$append(" class=\"");
      output_buffer['$append=']((toc_role));
      output_buffer.$append("\">");
      if (toc_title !== false && toc_title !== nil) {
        output_buffer.$append("\n<div class=\"title\"");
        output_buffer['$append='](((($a = toc_title_id !== false && toc_title_id !== nil) ? " id=\"" + (toc_title_id) + "\"" : $a)));
        output_buffer.$append(">");
        output_buffer['$append=']((toc_title));
        output_buffer.$append("</div>");};
      output_buffer.$append("\n");
      output_buffer['$append='](((($opalScope.Asciidoctor)._scope.HTML5)._scope.DocumentTemplate.$outline(self.document, toc_levels)));
      output_buffer.$append("");};
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_toc")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$option?', '$attr?', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$each', '$text', '$blocks?', '$content', '$items', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, checklist = nil, marker_checked = nil, marker_unchecked = nil, style_class = nil;
    if (self.document == null) self.document = nil;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    if (($a = (checklist = (function() {if (($b = (self['$option?']("checklist"))) !== false && $b !== nil) {
      return "checklist"
      } else {
      return nil
    }; return nil; })())) !== false && $a !== nil) {
      if (($a = self['$option?']("interactive")) !== false && $a !== nil) {
        marker_checked = "<input type=\"checkbox\" data-item-complete=\"1\" checked>";
        marker_unchecked = "<input type=\"checkbox\" data-item-complete=\"0\">";
      } else if (($a = self.document['$attr?']("icons", "font")) !== false && $a !== nil) {
        marker_checked = "<i class=\"icon-check\"></i>";
        marker_unchecked = "<i class=\"icon-check-empty\"></i>";
        } else {
        marker_checked = "<input type=\"checkbox\" data-item-complete=\"1\" checked disabled>";
        marker_unchecked = "<input type=\"checkbox\" data-item-complete=\"0\" disabled>";
      }};
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["ulist", checklist, self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<ul");
    output_buffer['$append='](((function() {if (($a = (style_class = ((($b = checklist) !== false && $b !== nil) ? $b : self.style))) !== false && $a !== nil) {
      return " class=\"" + (style_class) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(">");
    ($a = ($b = self.$items()).$each, $a._p = (TMP_2 = function(item){var self = TMP_2._s || this, $a, $b;if (item == null) item = nil;
    output_buffer.$append("\n<li>\n<p>");
      if (($a = (($b = checklist !== false && checklist !== nil) ? (item['$attr?']("checkbox")) : $b)) !== false && $a !== nil) {
        output_buffer.$append("");
        output_buffer['$append='](("" + ((function() {if (($a = (item['$attr?']("checked"))) !== false && $a !== nil) {
          return marker_checked
          } else {
          return marker_unchecked
        }; return nil; })()) + " " + (item.$text())));
        output_buffer.$append("");
        } else {
        output_buffer.$append("");
        output_buffer['$append=']((item.$text()));
        output_buffer.$append("");
      };
      output_buffer.$append("</p>");
      if (($a = item['$blocks?']()) !== false && $a !== nil) {
        output_buffer.$append("\n");
        output_buffer['$append=']((item.$content()));
        output_buffer.$append("");};
      return output_buffer.$append("\n</li>");}, TMP_2._s = self, TMP_2), $a).call($b);
    output_buffer.$append("\n</ul>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_ulist")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$title', '$content', '$attr?', '$attr', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["verseblock", self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<pre class=\"content\">");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("</pre>");
    if (($a = ((($b = (self['$attr?']("attribution"))) !== false && $b !== nil) ? $b : (self['$attr?']("citetitle")))) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"attribution\">");
      if (($a = self['$attr?']("citetitle")) !== false && $a !== nil) {
        output_buffer.$append("\n<cite>");
        output_buffer['$append=']((self.$attr("citetitle")));
        output_buffer.$append("</cite>");};
      if (($a = self['$attr?']("attribution")) !== false && $a !== nil) {
        if (($a = self['$attr?']("citetitle")) !== false && $a !== nil) {
          output_buffer.$append("<br>")};
        output_buffer.$append("\n");
        output_buffer['$append='](("&#8212; " + (self.$attr("attribution"))));
        output_buffer.$append("");};
      output_buffer.$append("\n</div>");};
    output_buffer.$append("\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_verse")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$title?', '$captioned_title', '$attr', '$===', '$attr?', '$option?', '$<<', '$media_uri', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $case = nil, start_anchor = nil, delimiter = nil, autoplay_param = nil, loop_param = nil, src = nil, params = nil;
    if (self.id == null) self.id = nil;
    if (self.style == null) self.style = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<div");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append=']((["videoblock", self.style, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\">");
    if (($a = self['$title?']()) !== false && $a !== nil) {
      output_buffer.$append("\n<div class=\"title\">");
      output_buffer['$append=']((self.$captioned_title()));
      output_buffer.$append("</div>");};
    output_buffer.$append("\n<div class=\"content\">");
    $case = self.$attr("poster");if ("vimeo"['$===']($case)) {start_anchor = (function() {if (($a = (self['$attr?']("start"))) !== false && $a !== nil) {
      return "#at=" + (self.$attr("start"))
      } else {
      return nil
    }; return nil; })();
    delimiter = "?";
    autoplay_param = (function() {if (($a = (self['$option?']("autoplay"))) !== false && $a !== nil) {
      return "" + (delimiter) + "autoplay=1"
      } else {
      return nil
    }; return nil; })();
    if (autoplay_param !== false && autoplay_param !== nil) {
      delimiter = "&amp;"};
    loop_param = (function() {if (($a = (self['$option?']("loop"))) !== false && $a !== nil) {
      return "" + (delimiter) + "loop=1"
      } else {
      return nil
    }; return nil; })();
    src = "//player.vimeo.com/video/" + (self.$attr("target")) + (start_anchor) + (autoplay_param) + (loop_param);
    output_buffer.$append("\n<iframe");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("width"))) !== false && $a !== nil) {
      return " width=\"" + (self.$attr("width")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("height"))) !== false && $a !== nil) {
      return " height=\"" + (self.$attr("height")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(" src=\"");
    output_buffer['$append=']((src));
    output_buffer.$append("\" frameborder=\"0\" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>");}else if ("youtube"['$===']($case)) {params = ["rel=0"];
    if (($a = self['$attr?']("start")) !== false && $a !== nil) {
      params['$<<']("start=" + (self.$attr("start")))};
    if (($a = self['$attr?']("end")) !== false && $a !== nil) {
      params['$<<']("end=" + (self.$attr("end")))};
    if (($a = self['$option?']("autoplay")) !== false && $a !== nil) {
      params['$<<']("autoplay=1")};
    if (($a = self['$option?']("loop")) !== false && $a !== nil) {
      params['$<<']("loop=1")};
    if (($a = self['$option?']("nocontrols")) !== false && $a !== nil) {
      params['$<<']("controls=0")};
    src = "//www.youtube.com/embed/" + (self.$attr("target")) + "?" + (params['$*']("&amp;"));
    output_buffer.$append("\n<iframe");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("width"))) !== false && $a !== nil) {
      return " width=\"" + (self.$attr("width")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("height"))) !== false && $a !== nil) {
      return " height=\"" + (self.$attr("height")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(" src=\"");
    output_buffer['$append=']((src));
    output_buffer.$append("\" frameborder=\"0\"");
    output_buffer['$append='](((function() {if (($a = (self['$option?']("nofullscreen"))) !== false && $a !== nil) {
      return nil
      } else {
      return " allowfullscreen"
    }; return nil; })()));
    output_buffer.$append("></iframe>");}else {output_buffer.$append("\n<video src=\"");
    output_buffer['$append=']((self.$media_uri(self.$attr("target"))));
    output_buffer.$append("\"");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("width"))) !== false && $a !== nil) {
      return " width=\"" + (self.$attr("width")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("height"))) !== false && $a !== nil) {
      return " height=\"" + (self.$attr("height")) + "\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("");
    if (($a = self['$attr?']("poster")) !== false && $a !== nil) {
      output_buffer.$append(" poster=\"");
      output_buffer['$append=']((self.$media_uri(self.$attr("poster"))));
      output_buffer.$append("\"");};
    if (($a = self['$option?']("autoplay")) !== false && $a !== nil) {
      output_buffer.$append(" autoplay")};
    if (($a = self['$option?']("nocontrols")) === false || $a === nil) {
      output_buffer.$append(" controls")};
    if (($a = self['$option?']("loop")) !== false && $a !== nil) {
      output_buffer.$append(" loop")};
    output_buffer.$append(">\nYour browser does not support the video tag.\n</video>");};
    output_buffer.$append("\n</div>\n</div>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/block_video")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $hash2 = $opal.hash2, $range = $opal.range;
  $opal.add_stubs(['$new', '$append', '$append=', '$attr?', '$attr', '$each', '$doctitle', '$include?', '$>=', '$normalize_web_path', '$default_asciidoctor_stylesheet', '$read_asset', '$normalize_system_path', '$nil?', '$===', '$==', '$default_coderay_stylesheet', '$pygments_stylesheet', '$[]', '$empty?', '$docinfo', '$*', '$compact', '$noheader', '$doctype', '$outline', '$to_i', '$has_header?', '$notitle', '$title', '$sub_macros', '$>', '$downcase', '$content', '$footnotes?', '$index', '$text', '$footnotes', '$nofooter', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, $c, $d, TMP_3, $e, TMP_4, $case = nil, docinfo_content = nil, authorcount = nil;
    if (self.safe == null) self.safe = nil;
    if (self.id == null) self.id = nil;
    if (self.header == null) self.header = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<!DOCTYPE html>\n<html");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("nolang"))) !== false && $a !== nil) {
      return nil
      } else {
      return " lang=\"" + (self.$attr("lang", "en")) + "\""
    }; return nil; })()));
    output_buffer.$append(">\n<head>\n<meta http-equiv=\"Content-Type\" content=\"text/html; charset=");
    output_buffer['$append=']((self.$attr("encoding")));
    output_buffer.$append("\">\n<meta name=\"generator\" content=\"Asciidoctor ");
    output_buffer['$append=']((self.$attr("asciidoctor-version")));
    output_buffer.$append("\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
    ($a = ($b = ["description", "keywords", "author", "copyright"]).$each, $a._p = (TMP_2 = function(key){var self = TMP_2._s || this, $a;if (key == null) key = nil;
    if (($a = self['$attr?'](key)) !== false && $a !== nil) {
        output_buffer.$append("\n<meta name=\"");
        output_buffer['$append=']((key));
        output_buffer.$append("\" content=\"");
        output_buffer['$append=']((self.$attr(key)));
        return output_buffer.$append("\">");
        } else {
        return nil
      }}, TMP_2._s = self, TMP_2), $a).call($b);
    output_buffer.$append("\n<title>");
    output_buffer['$append=']((((($a = self.$doctitle($hash2(["sanitize"], {"sanitize": true}))) !== false && $a !== nil) ? $a : (self.$attr("untitled-label")))));
    output_buffer.$append("</title>");
    if (($a = ((($c = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $c))._scope.DEFAULT_STYLESHEET_KEYS['$include?'](self.$attr("stylesheet"))) !== false && $a !== nil) {
      if (($a = ((($c = self.safe['$>=']((((($d = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $d))._scope.SafeMode)._scope.SECURE)) !== false && $c !== nil) ? $c : (self['$attr?']("linkcss")))) !== false && $a !== nil) {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$normalize_web_path(((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.DEFAULT_STYLESHEET_NAME, (self.$attr("stylesdir", "")))));
        output_buffer.$append("\">");
        } else {
        output_buffer.$append("\n<style>\n");
        output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5.$default_asciidoctor_stylesheet()));
        output_buffer.$append("\n</style>");
      }
    } else if (($a = self['$attr?']("stylesheet")) !== false && $a !== nil) {
      if (($a = ((($c = self.safe['$>=']((((($d = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $d))._scope.SafeMode)._scope.SECURE)) !== false && $c !== nil) ? $c : (self['$attr?']("linkcss")))) !== false && $a !== nil) {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$normalize_web_path((self.$attr("stylesheet")), self.$attr("stylesdir", ""))));
        output_buffer.$append("\">");
        } else {
        output_buffer.$append("\n<style>\n");
        output_buffer['$append=']((self.$read_asset(self.$normalize_system_path((self.$attr("stylesheet")), (self.$attr("stylesdir", ""))), true)));
        output_buffer.$append("\n</style>");
      }};
    if (($a = self['$attr?']("icons", "font")) !== false && $a !== nil) {
      if (($a = ($c = (self.$attr("iconfont-remote", ""))['$nil?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$attr("iconfont-cdn", "http://cdnjs.cloudflare.com/ajax/libs/font-awesome/3.2.1/css/font-awesome.min.css")));
        output_buffer.$append("\">");
        } else {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$normalize_web_path("" + (self.$attr("iconfont-name", "font-awesome")) + ".css", (self.$attr("stylesdir", "")))));
        output_buffer.$append("\">");
      }};
    $case = self.$attr("source-highlighter");if ("coderay"['$===']($case)) {if ((self.$attr("coderay-css", "class"))['$==']("class")) {
      if (($a = ((($c = self.safe['$>=']((((($d = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $d))._scope.SafeMode)._scope.SECURE)) !== false && $c !== nil) ? $c : (self['$attr?']("linkcss")))) !== false && $a !== nil) {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$normalize_web_path("asciidoctor-coderay.css", (self.$attr("stylesdir", "")))));
        output_buffer.$append("\">");
        } else {
        output_buffer.$append("\n<style>\n");
        output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5.$default_coderay_stylesheet()));
        output_buffer.$append("\n</style>");
      }}}else if ("pygments"['$===']($case)) {if ((self.$attr("pygments-css", "class"))['$==']("class")) {
      if (($a = ((($c = self.safe['$>=']((((($d = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $d))._scope.SafeMode)._scope.SECURE)) !== false && $c !== nil) ? $c : (self['$attr?']("linkcss")))) !== false && $a !== nil) {
        output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
        output_buffer['$append=']((self.$normalize_web_path("asciidoctor-pygments.css", (self.$attr("stylesdir", "")))));
        output_buffer.$append("\">");
        } else {
        output_buffer.$append("\n<style>\n");
        output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5.$pygments_stylesheet(self.$attr("pygments-style"))));
        output_buffer.$append("\n</style>");
      }}}else if ("highlightjs"['$===']($case)) {output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
    output_buffer['$append=']((self.$attr("highlightjsdir", "http://cdnjs.cloudflare.com/ajax/libs/highlight.js/7.4")));
    output_buffer.$append("/styles/");
    output_buffer['$append=']((self.$attr("highlightjs-theme", "googlecode")));
    output_buffer.$append(".min.css\">\n<script src=\"");
    output_buffer['$append=']((self.$attr("highlightjsdir", "http://cdnjs.cloudflare.com/ajax/libs/highlight.js/7.4")));
    output_buffer.$append("/highlight.min.js\"></script>\n<script src=\"");
    output_buffer['$append=']((self.$attr("highlightjsdir", "http://cdnjs.cloudflare.com/ajax/libs/highlight.js/7.4")));
    output_buffer.$append("/lang/common.min.js\"></script>\n<script>hljs.initHighlightingOnLoad()</script>");}else if ("prettify"['$===']($case)) {output_buffer.$append("\n<link rel=\"stylesheet\" href=\"");
    output_buffer['$append=']((self.$attr("prettifydir", "http://cdnjs.cloudflare.com/ajax/libs/prettify/r298")));
    output_buffer.$append("/");
    output_buffer['$append=']((self.$attr("prettify-theme", "prettify")));
    output_buffer.$append(".min.css\">\n<script src=\"");
    output_buffer['$append=']((self.$attr("prettifydir", "http://cdnjs.cloudflare.com/ajax/libs/prettify/r298")));
    output_buffer.$append("/prettify.min.js\"></script>\n<script>document.addEventListener('DOMContentLoaded', prettyPrint)</script>");};
    if (($a = self['$attr?']("math")) !== false && $a !== nil) {
      output_buffer.$append("\n<script type=\"text/x-mathjax-config\">\nMathJax.Hub.Config({\n  tex2jax: {\n    inlineMath: [");
      output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.INLINE_MATH_DELIMITERS['$[]']("latexmath")));
      output_buffer.$append("],\n    displayMath: [");
      output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.BLOCK_MATH_DELIMITERS['$[]']("latexmath")));
      output_buffer.$append("],\n    ignoreClass: 'nomath|nolatexmath'\n  },\n  asciimath2jax: {\n    delimiters: [");
      output_buffer['$append=']((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.BLOCK_MATH_DELIMITERS['$[]']("asciimath")));
      output_buffer.$append("],\n    ignoreClass: 'nomath|noasciimath'\n  }\n});\n</script>\n<script type=\"text/javascript\" src=\"http://cdn.mathjax.org/mathjax/latest/MathJax.js?config=TeX-MML-AM_HTMLorMML\"></script>\n<script>document.addEventListener('DOMContentLoaded', MathJax.Hub.TypeSet)</script>");};
    output_buffer.$append("");
    output_buffer['$append='](((function() {if (($a = ((docinfo_content = self.$docinfo()))['$empty?']()) !== false && $a !== nil) {
      return nil
      } else {
      return "\n" + (docinfo_content)
    }; return nil; })()));
    output_buffer.$append("\n</head>\n<body");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
    output_buffer.$append(" class=\"");
    output_buffer['$append='](([(self.$attr("doctype")), ((function() {if (($a = ($c = ($d = (self['$attr?']("toc-class")), $d !== false && $d !== nil ?(self['$attr?']("toc")) : $d), $c !== false && $c !== nil ?(self['$attr?']("toc-placement", "auto")) : $c)) !== false && $a !== nil) {
      return "" + (self.$attr("toc-class")) + " toc-" + (self.$attr("toc-position", "left"))
      } else {
      return nil
    }; return nil; })())].$compact()['$*'](" ")));
    output_buffer.$append("\"");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("max-width"))) !== false && $a !== nil) {
      return " style=\"max-width: " + (self.$attr("max-width")) + ";\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(">");
    if (($a = self.$noheader()) === false || $a === nil) {
      output_buffer.$append("\n<div id=\"header\">");
      if (self.$doctype()['$==']("manpage")) {
        output_buffer.$append("\n<h1>");
        output_buffer['$append=']((self.$doctitle()));
        output_buffer.$append(" Manual Page</h1>");
        if (($a = ($c = (self['$attr?']("toc")), $c !== false && $c !== nil ?(self['$attr?']("toc-placement", "auto")) : $c)) !== false && $a !== nil) {
          output_buffer.$append("\n<div id=\"toc\" class=\"");
          output_buffer['$append=']((self.$attr("toc-class", "toc")));
          output_buffer.$append("\">\n<div id=\"toctitle\">");
          output_buffer['$append=']((self.$attr("toc-title")));
          output_buffer.$append("</div>\n");
          output_buffer['$append='](((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5)._scope.DocumentTemplate.$outline(self, (self.$attr("toclevels", 2)).$to_i())));
          output_buffer.$append("\n</div>");};
        output_buffer.$append("\n<h2>");
        output_buffer['$append=']((self.$attr("manname-title")));
        output_buffer.$append("</h2>\n<div class=\"sectionbody\">\n<p>");
        output_buffer['$append='](("" + (self.$attr("manname")) + " - " + (self.$attr("manpurpose"))));
        output_buffer.$append("</p>\n</div>");
        } else {
        if (($a = self['$has_header?']()) !== false && $a !== nil) {
          if (($a = self.$notitle()) === false || $a === nil) {
            output_buffer.$append("\n<h1>");
            output_buffer['$append=']((self.header.$title()));
            output_buffer.$append("</h1>");};
          if (($a = self['$attr?']("author")) !== false && $a !== nil) {
            output_buffer.$append("\n<span id=\"author\" class=\"author\">");
            output_buffer['$append=']((self.$attr("author")));
            output_buffer.$append("</span><br>");
            if (($a = self['$attr?']("email")) !== false && $a !== nil) {
              output_buffer.$append("\n<span id=\"email\" class=\"email\">");
              output_buffer['$append=']((self.$sub_macros(self.$attr("email"))));
              output_buffer.$append("</span><br>");};
            if (((authorcount = (self.$attr("authorcount")).$to_i()))['$>'](1)) {
              ($a = ($c = ($range(2, authorcount, false))).$each, $a._p = (TMP_3 = function(idx){var self = TMP_3._s || this, $a;if (idx == null) idx = nil;
              output_buffer.$append("\n<span id=\"author");
                output_buffer['$append=']((idx));
                output_buffer.$append("\" class=\"author\">");
                output_buffer['$append=']((self.$attr("author_" + (idx))));
                output_buffer.$append("</span><br>");
                if (($a = self['$attr?']("email_" + (idx))) !== false && $a !== nil) {
                  output_buffer.$append("\n<span id=\"email");
                  output_buffer['$append=']((idx));
                  output_buffer.$append("\" class=\"email\">");
                  output_buffer['$append=']((self.$sub_macros(self.$attr("email_" + (idx)))));
                  return output_buffer.$append("</span><br>");
                  } else {
                  return nil
                };}, TMP_3._s = self, TMP_3), $a).call($c)};};
          if (($a = self['$attr?']("revnumber")) !== false && $a !== nil) {
            output_buffer.$append("\n<span id=\"revnumber\">");
            output_buffer['$append='](((((($a = (self.$attr("version-label"))) !== false && $a !== nil) ? $a : "")).$downcase()));
            output_buffer.$append(" ");
            output_buffer['$append=']((self.$attr("revnumber")));
            output_buffer.$append("");
            output_buffer['$append='](((function() {if (($a = self['$attr?']("revdate")) !== false && $a !== nil) {
              return ","
              } else {
              return ""
            }; return nil; })()));
            output_buffer.$append("</span>");};
          if (($a = self['$attr?']("revdate")) !== false && $a !== nil) {
            output_buffer.$append("\n<span id=\"revdate\">");
            output_buffer['$append=']((self.$attr("revdate")));
            output_buffer.$append("</span>");};
          if (($a = self['$attr?']("revremark")) !== false && $a !== nil) {
            output_buffer.$append("\n<br>\n<span id=\"revremark\">");
            output_buffer['$append=']((self.$attr("revremark")));
            output_buffer.$append("</span>");};};
        if (($a = ($d = (self['$attr?']("toc")), $d !== false && $d !== nil ?(self['$attr?']("toc-placement", "auto")) : $d)) !== false && $a !== nil) {
          output_buffer.$append("\n<div id=\"toc\" class=\"");
          output_buffer['$append=']((self.$attr("toc-class", "toc")));
          output_buffer.$append("\">\n<div id=\"toctitle\">");
          output_buffer['$append=']((self.$attr("toc-title")));
          output_buffer.$append("</div>\n");
          output_buffer['$append='](((((($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a))._scope.HTML5)._scope.DocumentTemplate.$outline(self, (self.$attr("toclevels", 2)).$to_i())));
          output_buffer.$append("\n</div>");};
      };
      output_buffer.$append("\n</div>");};
    output_buffer.$append("\n<div id=\"content\">\n");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("\n</div>");
    if (($a = ((($d = ($e = self['$footnotes?'](), ($e === nil || $e === false))) !== false && $d !== nil) ? $d : self['$attr?']("nofootnotes"))) === false || $a === nil) {
      output_buffer.$append("\n<div id=\"footnotes\">\n<hr>");
      ($a = ($d = self.$footnotes()).$each, $a._p = (TMP_4 = function(fn){var self = TMP_4._s || this;if (fn == null) fn = nil;
      output_buffer.$append("\n<div class=\"footnote\" id=\"_footnote_");
        output_buffer['$append=']((fn.$index()));
        output_buffer.$append("\">\n<a href=\"#_footnoteref_");
        output_buffer['$append=']((fn.$index()));
        output_buffer.$append("\">");
        output_buffer['$append=']((fn.$index()));
        output_buffer.$append("</a>. ");
        output_buffer['$append=']((fn.$text()));
        return output_buffer.$append("\n</div>");}, TMP_4._s = self, TMP_4), $a).call($d);
      output_buffer.$append("\n</div>");};
    output_buffer.$append("");
    if (($a = self.$nofooter()) === false || $a === nil) {
      output_buffer.$append("\n<div id=\"footer\">\n<div id=\"footer-text\">");
      if (($a = self['$attr?']("revnumber")) !== false && $a !== nil) {
        output_buffer.$append("\n");
        output_buffer['$append='](("" + (self.$attr("version-label")) + " " + (self.$attr("revnumber"))));
        output_buffer.$append("<br>");};
      if (($a = self['$attr?']("last-update-label")) !== false && $a !== nil) {
        output_buffer.$append("\n");
        output_buffer['$append='](("" + (self.$attr("last-update-label")) + " " + (self.$attr("docdatetime"))));
        output_buffer.$append("");};
      output_buffer.$append("");
      output_buffer['$append='](((function() {if (($a = ((docinfo_content = (self.$docinfo("footer"))))['$empty?']()) !== false && $a !== nil) {
        return nil
        } else {
        return "\n" + (docinfo_content)
      }; return nil; })()));
      output_buffer.$append("\n</div>\n</div>");};
    output_buffer.$append("\n</body>\n</html>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/document")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$notitle', '$has_header?', '$append=', '$title', '$content', '$footnotes?', '$attr?', '$each', '$index', '$text', '$footnotes', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, TMP_2;
    if (self.id == null) self.id = nil;
    if (self.header == null) self.header = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    if (($a = ($b = ($c = self.$notitle(), ($c === nil || $c === false)), $b !== false && $b !== nil ?self['$has_header?']() : $b)) !== false && $a !== nil) {
      output_buffer.$append("<h1");
      output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
      output_buffer.$append(">");
      output_buffer['$append=']((self.header.$title()));
      output_buffer.$append("</h1>");};
    output_buffer.$append("");
    output_buffer['$append=']((self.$content()));
    output_buffer.$append("");
    if (($a = ($b = self['$footnotes?'](), $b !== false && $b !== nil ?($c = (self['$attr?']("nofootnotes")), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
      output_buffer.$append("\n<div id=\"footnotes\">\n<hr>");
      ($a = ($b = self.$footnotes()).$each, $a._p = (TMP_2 = function(fn){var self = TMP_2._s || this;if (fn == null) fn = nil;
      output_buffer.$append("");
        output_buffer['$append='](("\n<div class=\"footnote\" id=\"_footnote_" + (fn.$index()) + "\">\n<a href=\"#_footnoteref_" + (fn.$index()) + "\">" + (fn.$index()) + "</a>. " + (fn.$text()) + "\n</div>"));
        return output_buffer.$append("");}, TMP_2._s = self, TMP_2), $a).call($b);
      output_buffer.$append("\n</div>");};
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/embedded")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$===', '$attr', '$append=', '$tr_s', '$fetch', '$[]', '$references', '$role?', '$role', '$attr?', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $case = nil, refid = nil;
    if (self.type == null) self.type = nil;
    if (self.target == null) self.target = nil;
    if (self.text == null) self.text = nil;
    if (self.document == null) self.document = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    $case = self.type;if ("xref"['$===']($case)) {refid = ((($a = (self.$attr("refid"))) !== false && $a !== nil) ? $a : self.target);
    output_buffer.$append("");
    output_buffer['$append='](("<a href=\"" + (self.target) + "\">" + (((($a = self.text) !== false && $a !== nil) ? $a : self.document.$references()['$[]']("ids").$fetch(refid, "[" + (refid) + "]").$tr_s("\n", " "))) + "</a>"));
    output_buffer.$append("");}else if ("ref"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<a id=\"" + (self.target) + "\"></a>"));
    output_buffer.$append("");}else if ("bibref"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<a id=\"" + (self.target) + "\"></a>[" + (self.target) + "]"));
    output_buffer.$append("");}else {output_buffer.$append("");
    output_buffer['$append='](("<a href=\"" + (self.target) + "\"" + ((function() {if (($a = self['$role?']()) !== false && $a !== nil) {
      return " class=\"" + (self.$role()) + "\""
      } else {
      return nil
    }; return nil; })()) + ((function() {if (($a = (self['$attr?']("window"))) !== false && $a !== nil) {
      return " target=\"" + (self.$attr("window")) + "\""
      } else {
      return nil
    }; return nil; })()) + ">" + (self.text) + "</a>"));
    output_buffer.$append("");};
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_anchor")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;
    if (self.text == null) self.text = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer['$append=']((self.text));
    output_buffer.$append("<br>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_break")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;
    if (self.text == null) self.text = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<b class=\"button\">");
    output_buffer['$append=']((self.text));
    output_buffer.$append("</b>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_button")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$attr?', '$append=', '$icon_uri', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a;
    if (self.document == null) self.document = nil;
    if (self.text == null) self.text = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    if (($a = self.document['$attr?']("icons", "font")) !== false && $a !== nil) {
      output_buffer.$append("<i class=\"conum\" data-value=\"");
      output_buffer['$append=']((self.text));
      output_buffer.$append("\"></i><b>(");
      output_buffer['$append=']((self.text));
      output_buffer.$append(")</b>");
    } else if (($a = self.document['$attr?']("icons")) !== false && $a !== nil) {
      output_buffer.$append("<img src=\"");
      output_buffer['$append=']((self.$icon_uri("callouts/" + (self.text))));
      output_buffer.$append("\" alt=\"");
      output_buffer['$append=']((self.text));
      output_buffer.$append("\">");
      } else {
      output_buffer.$append("<b>(");
      output_buffer['$append=']((self.text));
      output_buffer.$append(")</b>");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_callout")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$attr', '$==', '$append=', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, idx = nil;
    if (self.type == null) self.type = nil;
    if (self.id == null) self.id = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    idx = self.$attr("index");
    if (self.type['$==']("xref")) {
      output_buffer.$append("");
      output_buffer['$append='](("<span class=\"footnoteref\">[<a class=\"footnote\" href=\"#_footnote_" + (idx) + "\" title=\"View footnote.\">" + (idx) + "</a>]</span>"));
      output_buffer.$append("");
      } else {
      output_buffer.$append("");
      output_buffer['$append='](("<span class=\"footnote\"" + (($a = self.id, $a !== false && $a !== nil ?" id=\"_footnote_" + (self.id) + "\"" : $a)) + ">[<a id=\"_footnoteref_" + (idx) + "\" class=\"footnote\" href=\"#_footnote_" + (idx) + "\" title=\"View footnote.\">" + (idx) + "</a>]</span>"));
      output_buffer.$append("");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_footnote")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$*', '$compact', '$role', '$attr?', '$attr', '$==', '$<<', '$icon_uri', '$image_uri', '$join', '$map']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, TMP_2, style_class = nil, title_attr = nil, img = nil, img_src = nil, img_attrs = nil;
    if (self.type == null) self.type = nil;
    if (self.document == null) self.document = nil;
    if (self.target == null) self.target = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("<span class=\"");
    output_buffer['$append='](([self.type, self.$role()].$compact()['$*'](" ")));
    output_buffer.$append("\"");
    output_buffer['$append='](((function() {if (($a = (self['$attr?']("float"))) !== false && $a !== nil) {
      return " style=\"float: " + (self.$attr("float")) + ";\""
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append(">");
    if (($a = (($b = self.type['$==']("icon")) ? (self.document['$attr?']("icons", "font")) : $b)) !== false && $a !== nil) {
      style_class = ["icon-" + (self.target)];
      if (($a = self['$attr?']("size")) !== false && $a !== nil) {
        style_class['$<<']("icon-" + (self.$attr("size")))};
      if (($a = self['$attr?']("rotate")) !== false && $a !== nil) {
        style_class['$<<']("icon-rotate-" + (self.$attr("rotate")))};
      if (($a = self['$attr?']("flip")) !== false && $a !== nil) {
        style_class['$<<']("icon-flip-" + (self.$attr("flip")))};
      title_attr = (function() {if (($a = (self['$attr?']("title"))) !== false && $a !== nil) {
        return " title=\"" + (self.$attr("title")) + "\""
        } else {
        return nil
      }; return nil; })();
      img = "<i class=\"" + (style_class['$*'](" ")) + "\"" + (title_attr) + "></i>";
    } else if (($a = (($b = self.type['$==']("icon")) ? ($c = (self.document['$attr?']("icons")), ($c === nil || $c === false)) : $b)) !== false && $a !== nil) {
      img = "[" + (self.$attr("alt")) + "]"
      } else {
      img_src = ((function() {if (self.type['$==']("icon")) {
        return (self.$icon_uri(self.target))
        } else {
        return (self.$image_uri(self.target))
      }; return nil; })());
      img_attrs = ($a = ($b = ["alt", "width", "height", "title"]).$map, $a._p = (TMP_2 = function(name){var self = TMP_2._s || this, $a;if (name == null) name = nil;
      if (($a = (self['$attr?'](name))) !== false && $a !== nil) {
          return " " + (name) + "=\"" + (self.$attr(name)) + "\""
          } else {
          return nil
        }}, TMP_2._s = self, TMP_2), $a).call($b).$join();
      img = "<img src=\"" + (img_src) + "\"" + (img_attrs) + ">";
    };
    if (($a = self['$attr?']("link")) !== false && $a !== nil) {
      output_buffer.$append("<a class=\"image\" href=\"");
      output_buffer['$append=']((self.$attr("link")));
      output_buffer.$append("\"");
      output_buffer['$append='](((function() {if (($a = (self['$attr?']("window"))) !== false && $a !== nil) {
        return " target=\"" + (self.$attr("window")) + "\""
        } else {
        return nil
      }; return nil; })()));
      output_buffer.$append(">");
      output_buffer['$append=']((img));
      output_buffer.$append("</a>");
      } else {
      output_buffer.$append("");
      output_buffer['$append=']((img));
      output_buffer.$append("");
    };
    output_buffer.$append("</span>\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_image")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$==', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this;
    if (self.type == null) self.type = nil;
    if (self.text == null) self.text = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    output_buffer['$append='](((function() {if (self.type['$==']("visible")) {
      return self.text
      } else {
      return nil
    }; return nil; })()));
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_indexterm")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$attr', '$==', '$size', '$append=', '$first', '$map', '$+', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, keys = nil, idx = nil;if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    keys = self.$attr("keys");
    if (keys.$size()['$=='](1)) {
      output_buffer.$append("<kbd>");
      output_buffer['$append=']((keys.$first()));
      output_buffer.$append("</kbd>");
      } else {
      output_buffer.$append("<kbd class=\"keyseq\">");
      idx = 0;
      ($a = ($b = keys).$map, $a._p = (TMP_2 = function(key){var self = TMP_2._s || this;if (key == null) key = nil;
      output_buffer.$append("");
        output_buffer['$append='](((function() {if (((idx = idx['$+'](1)))['$=='](1)) {
          return nil
          } else {
          return "+"
        }; return nil; })()));
        output_buffer.$append("<kbd>");
        output_buffer['$append=']((key));
        return output_buffer.$append("</kbd>");}, TMP_2._s = self, TMP_2), $a).call($b);
      output_buffer.$append("</kbd>");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_kbd")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$attr', '$empty?', '$chop', '$join', '$map', '$append=', '$nil?']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, TMP_2, $c, menu = nil, submenus = nil, menuitem = nil, submenu_path = nil;if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    menu = self.$attr("menu");
    submenus = self.$attr("submenus");
    menuitem = self.$attr("menuitem");
    if (($a = ($b = submenus['$empty?'](), ($b === nil || $b === false))) !== false && $a !== nil) {
      submenu_path = ($a = ($b = submenus).$map, $a._p = (TMP_2 = function(submenu){var self = TMP_2._s || this;if (submenu == null) submenu = nil;
      return "<span class=\"submenu\">" + (submenu) + "</span>&#160;&#9656; "}, TMP_2._s = self, TMP_2), $a).call($b).$join().$chop();
      output_buffer.$append("<span class=\"menuseq\"><span class=\"menu\">");
      output_buffer['$append=']((menu));
      output_buffer.$append("</span>&#160;&#9656; ");
      output_buffer['$append=']((submenu_path));
      output_buffer.$append(" <span class=\"menuitem\">");
      output_buffer['$append=']((menuitem));
      output_buffer.$append("</span></span>");
    } else if (($a = ($c = menuitem['$nil?'](), ($c === nil || $c === false))) !== false && $a !== nil) {
      output_buffer.$append("<span class=\"menuseq\"><span class=\"menu\">");
      output_buffer['$append=']((menu));
      output_buffer.$append("</span>&#160;&#9656; <span class=\"menuitem\">");
      output_buffer['$append=']((menuitem));
      output_buffer.$append("</span></span>");
      } else {
      output_buffer.$append("<span class=\"menu\">");
      output_buffer['$append=']((menu));
      output_buffer.$append("</span>");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_menu")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$append=', '$role', '$===', '$[]', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, class_attr = nil, style_class = nil, $case = nil, open = nil, close = nil;
    if (self.id == null) self.id = nil;
    if (self.type == null) self.type = nil;
    if (self.text == null) self.text = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?"<a id=\"" + (self.id) + "\"></a>" : $a)));
    output_buffer.$append("");
    class_attr = (function() {if (($a = (style_class = self.$role())) !== false && $a !== nil) {
      return " class=\"" + (style_class) + "\""
      } else {
      return nil
    }; return nil; })();
    $case = self.type;if ("emphasis"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<em" + (class_attr) + ">" + (self.text) + "</em>"));
    output_buffer.$append("");}else if ("strong"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<strong" + (class_attr) + ">" + (self.text) + "</strong>"));
    output_buffer.$append("");}else if ("monospaced"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<code" + (class_attr) + ">" + (self.text) + "</code>"));
    output_buffer.$append("");}else if ("superscript"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<sup" + (class_attr) + ">" + (self.text) + "</sup>"));
    output_buffer.$append("");}else if ("subscript"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](("<sub" + (class_attr) + ">" + (self.text) + "</sub>"));
    output_buffer.$append("");}else if ("double"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](((function() {if (class_attr !== false && class_attr !== nil) {
      return "<span" + (class_attr) + ">&#8220;" + (self.text) + "&#8221;</span>"
      } else {
      return "&#8220;" + (self.text) + "&#8221;"
    }; return nil; })()));
    output_buffer.$append("");}else if ("single"['$===']($case)) {output_buffer.$append("");
    output_buffer['$append='](((function() {if (class_attr !== false && class_attr !== nil) {
      return "<span" + (class_attr) + ">&#8216;" + (self.text) + "&#8217;</span>"
      } else {
      return "&#8216;" + (self.text) + "&#8217;"
    }; return nil; })()));
    output_buffer.$append("");}else if ("asciimath"['$===']($case) || "latexmath"['$===']($case)) {$a = $opal.to_ary(((($b = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $b))._scope.INLINE_MATH_DELIMITERS['$[]'](self.type)), open = ($a[0] == null ? nil : $a[0]), close = ($a[1] == null ? nil : $a[1]);
    output_buffer.$append("");
    output_buffer['$append='](("" + (open) + (self.text) + (close)));
    output_buffer.$append("");}else {output_buffer.$append("");
    output_buffer['$append='](((function() {if (class_attr !== false && class_attr !== nil) {
      return "<span" + (class_attr) + ">" + (self.text) + "</span>"
      } else {
      return self.text
    }; return nil; })()));
    output_buffer.$append("");};
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/inline_quoted")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, $b, TMP_1, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  $opal.add_stubs(['$new', '$append', '$zero?', '$attr?', '$append=', '$title', '$content', '$nil?', '$<=', '$to_i', '$attr', '$sectnum', '$+', '$*', '$compact', '$role', '$captioned_title', '$==', '$join']);
  return ($a = ($b = $opalScope.Template).$new, $a._p = (TMP_1 = function(output_buffer){var self = TMP_1._s || this, $a, $b, $c, slevel = nil, anchor = nil, link_start = nil, link_end = nil, snum = nil, hlevel = nil;
    if (self.level == null) self.level = nil;
    if (self.special == null) self.special = nil;
    if (self.id == null) self.id = nil;
    if (self.document == null) self.document = nil;
    if (self.numbered == null) self.numbered = nil;
    if (self.caption == null) self.caption = nil;
if (output_buffer == null) output_buffer = nil;
  output_buffer.$append("");
    output_buffer.$append("");
    slevel = (function() {if (($a = ($b = self.level['$zero?'](), $b !== false && $b !== nil ?self.special : $b)) !== false && $a !== nil) {
      return 1
      } else {
      return self.level
    }; return nil; })();
    anchor = link_start = link_end = nil;
    if (($a = self.id) !== false && $a !== nil) {
      if (($a = self.document['$attr?']("sectanchors")) !== false && $a !== nil) {
        anchor = "<a class=\"anchor\" href=\"#" + (self.id) + "\"></a>"
      } else if (($a = self.document['$attr?']("sectlinks")) !== false && $a !== nil) {
        link_start = "<a class=\"link\" href=\"#" + (self.id) + "\">";
        link_end = "</a>";}};
    if (($a = slevel['$zero?']()) !== false && $a !== nil) {
      output_buffer.$append("<h1");
      output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
      output_buffer.$append(" class=\"sect0\">");
      output_buffer['$append='](("" + (anchor) + (link_start) + (self.$title()) + (link_end)));
      output_buffer.$append("</h1>\n");
      output_buffer['$append=']((self.$content()));
      output_buffer.$append("");
      } else {
      snum = (function() {if (($a = ($b = ($c = self.numbered, $c !== false && $c !== nil ?self.caption['$nil?']() : $c), $b !== false && $b !== nil ?slevel['$<=']((self.document.$attr("sectnumlevels", 3)).$to_i()) : $b)) !== false && $a !== nil) {
        return "" + (self.$sectnum()) + " "
        } else {
        return nil
      }; return nil; })();
      hlevel = slevel['$+'](1);
      output_buffer.$append("<div class=\"");
      output_buffer['$append=']((["sect" + (slevel), self.$role()].$compact()['$*'](" ")));
      output_buffer.$append("\">\n<h");
      output_buffer['$append=']((hlevel));
      output_buffer.$append("");
      output_buffer['$append=']((($a = self.id, $a !== false && $a !== nil ?" id=\"" + (self.id) + "\"" : $a)));
      output_buffer.$append(">");
      output_buffer['$append='](("" + (anchor) + (link_start) + (snum) + (self.$captioned_title()) + (link_end)));
      output_buffer.$append("</h");
      output_buffer['$append=']((hlevel));
      output_buffer.$append(">");
      if (slevel['$=='](1)) {
        output_buffer.$append("\n<div class=\"sectionbody\">\n");
        output_buffer['$append=']((self.$content()));
        output_buffer.$append("\n</div>");
        } else {
        output_buffer.$append("\n");
        output_buffer['$append=']((self.$content()));
        output_buffer.$append("");
      };
      output_buffer.$append("\n</div>");
    };
    output_buffer.$append("\n");
    return output_buffer.$join();}, TMP_1._s = self, TMP_1), $a).call($b, "asciidoctor/backends/erb/html5/section")
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  ;
  return true;
})(Opal);
/* Generated by Opal 0.5.5 */
(function($opal) {
  var $a, self = $opal.top, $opalScope = $opal, nil = $opal.nil, $breaker = $opal.breaker, $slice = $opal.slice, $gvars = $opal.gvars, $module = $opal.module, $hash2 = $opal.hash2, $range = $opal.range;
  if (($a = ($opalScope.RUBY_ENGINE != null)) === false || $a === nil) {
    $opal.cdecl($opalScope, 'RUBY_ENGINE', "unknown")};
  $opal.cdecl($opalScope, 'RUBY_ENGINE_OPAL', ($opalScope.RUBY_ENGINE['$==']("opal")));
  $opal.cdecl($opalScope, 'RUBY_ENGINE_JRUBY', ($opalScope.RUBY_ENGINE['$==']("jruby")));
  ;
  if (($a = $opalScope.RUBY_ENGINE_OPAL) !== false && $a !== nil) {
    ;
    ;
    ;
    ;};
  $gvars[":"].$unshift($opalScope.File.$dirname("asciidoctor"));
  return (function($base) {
    var self = $module($base, 'Asciidoctor');

    var def = self._proto, $opalScope = self._scope, $a, $b, $c, TMP_1, TMP_2, $d;
    if (($a = (($b = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $b)) === false || $a === nil) {
      ;

      ;

      ;

      ;

      ;};

    (function($base) {
      var self = $module($base, 'SafeMode');

      var def = self._proto, $opalScope = self._scope;
      $opal.cdecl($opalScope, 'UNSAFE', 0);

      $opal.cdecl($opalScope, 'SAFE', 1);

      $opal.cdecl($opalScope, 'SERVER', 10);

      $opal.cdecl($opalScope, 'SECURE', 20);
      
    })(self);

    (function($base) {
      var self = $module($base, 'Compliance');

      var def = self._proto, $opalScope = self._scope;
      self.block_terminates_paragraph = true;

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("block_terminates_paragraph")
      })(self.$singleton_class());

      self.strict_verbatim_paragraphs = true;

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("strict_verbatim_paragraphs")
      })(self.$singleton_class());

      self.underline_style_section_titles = true;

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("underline_style_section_titles")
      })(self.$singleton_class());

      self.unwrap_standalone_preamble = true;

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("unwrap_standalone_preamble")
      })(self.$singleton_class());

      self.attribute_missing = "skip";

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("attribute_missing")
      })(self.$singleton_class());

      self.attribute_undefined = "drop-line";

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("attribute_undefined")
      })(self.$singleton_class());

      self.markdown_syntax = true;

      (function(self) {
        var $opalScope = self._scope, def = self._proto;
        return self.$attr_accessor("markdown_syntax")
      })(self.$singleton_class());
      
    })(self);

    $opal.cdecl($opalScope, 'LIB_PATH', (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$expand_path((($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname("asciidoctor")));

    $opal.cdecl($opalScope, 'ROOT_PATH', (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname($opalScope.LIB_PATH));

    $opal.cdecl($opalScope, 'USER_HOME', (function() {if ((($a = $opal.Object._scope.RUBY_VERSION) == null ? $opal.cm('RUBY_VERSION') : $a)['$>=']("1.9")) {
      return (($a = $opal.Object._scope.Dir) == null ? $opal.cm('Dir') : $a).$home()
      } else {
      return $opalScope.ENV['$[]']("HOME")
    }; return nil; })());

    $opal.cdecl($opalScope, 'COERCE_ENCODING', ($a = ($b = (($c = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $c), ($b === nil || $b === false)), $a !== false && $a !== nil ?(($b = $opal.Object._scope.RUBY_VERSION) == null ? $opal.cm('RUBY_VERSION') : $b)['$>=']("1.9") : $a));

    $opal.cdecl($opalScope, 'FORCE_ENCODING', ($a = $opalScope.COERCE_ENCODING, $a !== false && $a !== nil ?($b = (($c = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $c).$default_external()['$=='](((($c = $opal.Object._scope.Encoding) == null ? $opal.cm('Encoding') : $c))._scope.UTF_8), ($b === nil || $b === false)) : $a));

    $opal.cdecl($opalScope, 'BOM_BYTES_UTF_8', "xefxbbxbf".$bytes().$to_a());

    $opal.cdecl($opalScope, 'BOM_BYTES_UTF_16LE', "xffxfe".$bytes().$to_a());

    $opal.cdecl($opalScope, 'BOM_BYTES_UTF_16BE', "xfexff".$bytes().$to_a());

    $opal.cdecl($opalScope, 'FORCE_UNICODE_LINE_LENGTH', (($a = $opal.Object._scope.RUBY_VERSION) == null ? $opal.cm('RUBY_VERSION') : $a)['$<']("1.9"));

    $opal.cdecl($opalScope, 'EOL', "\n");

    $opal.cdecl($opalScope, 'LINE_SPLIT', /\n/);

    $opal.cdecl($opalScope, 'DEFAULT_DOCTYPE', "article");

    $opal.cdecl($opalScope, 'DEFAULT_BACKEND', "html5");

    $opal.cdecl($opalScope, 'DEFAULT_STYLESHEET_KEYS', ["", "DEFAULT"].$to_set());

    $opal.cdecl($opalScope, 'DEFAULT_STYLESHEET_NAME', "asciidoctor.css");

    $opal.cdecl($opalScope, 'BACKEND_ALIASES', $hash2(["html", "docbook"], {"html": "html5", "docbook": "docbook45"}));

    $opal.cdecl($opalScope, 'DEFAULT_PAGE_WIDTHS', $hash2(["docbook"], {"docbook": 425}));

    $opal.cdecl($opalScope, 'DEFAULT_EXTENSIONS', $hash2(["html", "docbook", "asciidoc", "markdown"], {"html": ".html", "docbook": ".xml", "asciidoc": ".ad", "markdown": ".md"}));

    $opal.cdecl($opalScope, 'ASCIIDOC_EXTENSIONS', $hash2([".asciidoc", ".adoc", ".ad", ".asc", ".txt"], {".asciidoc": true, ".adoc": true, ".ad": true, ".asc": true, ".txt": true}));

    $opal.cdecl($opalScope, 'SECTION_LEVELS', $hash2(["=", "-", "~", "^", "+"], {"=": 0, "-": 1, "~": 2, "^": 3, "+": 4}));

    $opal.cdecl($opalScope, 'ADMONITION_STYLES', ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"].$to_set());

    $opal.cdecl($opalScope, 'PARAGRAPH_STYLES', ["comment", "example", "literal", "listing", "normal", "pass", "quote", "sidebar", "source", "verse", "abstract", "partintro"].$to_set());

    $opal.cdecl($opalScope, 'VERBATIM_STYLES', ["literal", "listing", "source", "verse"].$to_set());

    $opal.cdecl($opalScope, 'DELIMITED_BLOCKS', $hash2(["--", "----", "....", "====", "****", "____", "\"\"", "++++", "|===", ",===", ":===", "!===", "////", "```", "~~~"], {"--": ["open", ["comment", "example", "literal", "listing", "pass", "quote", "sidebar", "source", "verse", "admonition", "abstract", "partintro"].$to_set()], "----": ["listing", ["literal", "source"].$to_set()], "....": ["literal", ["listing", "source"].$to_set()], "====": ["example", ["admonition"].$to_set()], "****": ["sidebar", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], "____": ["quote", ["verse"].$to_set()], "\"\"": ["quote", ["verse"].$to_set()], "++++": ["pass", ["math", "latexmath", "asciimath"].$to_set()], "|===": ["table", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], ",===": ["table", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], ":===": ["table", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], "!===": ["table", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], "////": ["comment", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], "```": ["fenced_code", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()], "~~~": ["fenced_code", (($a = $opal.Object._scope.Set) == null ? $opal.cm('Set') : $a).$new()]}));

    $opal.cdecl($opalScope, 'DELIMITED_BLOCK_LEADERS', ($a = ($b = $opalScope.DELIMITED_BLOCKS.$keys()).$map, $a._p = (TMP_1 = function(key){var self = TMP_1._s || this;if (key == null) key = nil;
    return key['$[]']($range(0, 1, false))}, TMP_1._s = self, TMP_1), $a).call($b).$to_set());

    $opal.cdecl($opalScope, 'BREAK_LINES', $hash2(["'", "-", "*", "_", "<"], {"'": "ruler", "-": "ruler", "*": "ruler", "_": "ruler", "<": "page_break"}));

    $opal.cdecl($opalScope, 'NESTABLE_LIST_CONTEXTS', ["ulist", "olist", "dlist"]);

    $opal.cdecl($opalScope, 'ORDERED_LIST_STYLES', ["arabic", "loweralpha", "lowerroman", "upperalpha", "upperroman"]);

    $opal.cdecl($opalScope, 'ORDERED_LIST_MARKER_PATTERNS', $hash2(["arabic", "loweralpha", "lowerroman", "upperalpha", "upperroman"], {"arabic": /\d+[.>]/, "loweralpha": /[a-z]\./, "lowerroman": /[ivx]+\)/, "upperalpha": /[A-Z]\./, "upperroman": /[IVX]+\)/}));

    $opal.cdecl($opalScope, 'ORDERED_LIST_KEYWORDS', $hash2(["loweralpha", "lowerroman", "upperalpha", "upperroman"], {"loweralpha": "a", "lowerroman": "i", "upperalpha": "A", "upperroman": "I"}));

    $opal.cdecl($opalScope, 'LIST_CONTINUATION', "+");

    $opal.cdecl($opalScope, 'LINE_BREAK', " +");

    $opal.cdecl($opalScope, 'LINE_FEED_ENTITY', "&#10;");

    $opal.cdecl($opalScope, 'BLOCK_MATH_DELIMITERS', $hash2(["asciimath", "latexmath"], {"asciimath": ["\\$", "\\$"], "latexmath": ["\\[", "\\]"]}));

    $opal.cdecl($opalScope, 'INLINE_MATH_DELIMITERS', $hash2(["asciimath", "latexmath"], {"asciimath": ["\\$", "\\$"], "latexmath": ["\\(", "\\)"]}));

    $opal.cdecl($opalScope, 'FLEXIBLE_ATTRIBUTES', ["numbered"]);

    if (($a = (($c = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $c)) !== false && $a !== nil) {
      $opal.cdecl($opalScope, 'CC_ALPHA', "a-zA-Z");

      $opal.cdecl($opalScope, 'CC_ALNUM', "a-zA-Z0-9");

      $opal.cdecl($opalScope, 'CC_BLANK', "[ \t]");

      $opal.cdecl($opalScope, 'CC_GRAPH', "[x21-x7E]");

      $opal.cdecl($opalScope, 'CC_EOL', "(?=\n|$)");
      } else {
      $opal.cdecl($opalScope, 'CC_ALPHA', "[:alpha:]");

      $opal.cdecl($opalScope, 'CC_ALNUM', "[:alnum:]");

      $opal.cdecl($opalScope, 'CC_BLANK', "[[:blank:]]");

      $opal.cdecl($opalScope, 'CC_GRAPH', "[[:graph:]]");

      $opal.cdecl($opalScope, 'CC_EOL', "$");
    };

    $opal.cdecl($opalScope, 'BLANK_LINE_PATTERN', (new RegExp("^" + $opalScope.CC_BLANK + "*\\n")));

    $opal.cdecl($opalScope, 'PASS_PLACEHOLDER', $hash2(["start", "end", "match", "match_syn"], {"start": (function() {if (($a = (($c = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $c)) !== false && $a !== nil) {
      return (150).$chr()
      } else {
      return "u0096"
    }; return nil; })(), "end": (function() {if (($a = (($c = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $c)) !== false && $a !== nil) {
      return (151).$chr()
      } else {
      return "u0097"
    }; return nil; })(), "match": /\u0096(\d+)\u0097/, "match_syn": /<span[^>]*>\u0096<\/span>[^\d]*(\d+)[^\d]*<span[^>]*>\u0097<\/span>/}));

    $opal.cdecl($opalScope, 'REGEXP', $hash2(["admonition_inline", "anchor", "anchor_embedded", "anchor_macro", "any_blk", "any_list", "attr_entry", "blk_attr_list", "attr_line", "attr_ref", "author_info", "biblio_macro", "callout_render", "callout_quick_scan", "callout_scan", "colist", "comment_blk", "comment", "ssv_or_csv_delim", "space_delim", "kbd_delim", "escaped_space", "digits", "dlist", "dlist_siblings", "illegal_sectid_chars", "footnote_macro", "generic_blk_macro", "kbd_btn_macro", "menu_macro", "menu_inline_macro", "media_blk_macro", "image_macro", "indexterm_macro", "leading_blanks", "leading_parent_dirs", "line_break", "link_inline", "link_macro", "email_inline", "lit_par", "olist", "break_line", "break_line_plus", "pass_macro", "inline_math_macro", "pass_macro_basic", "pass_lit", "revision_info", "single_quote_esc", "illegal_attr_name_chars", "table_colspec", "table_cellspec", "trailing_digit", "blk_title", "dbl_quoted", "m_dbl_quoted", "section_float_style", "section_title", "section_name", "section_underline", "toc", "ulist", "xref_macro", "ifdef_macro", "eval_expr", "include_macro", "uri_sniff", "uri_encode_chars", "mantitle_manvolnum", "manname_manpurpose"], {"admonition_inline": (new RegExp("^(" + $opalScope.ADMONITION_STYLES.$to_a()['$*']("|") + "):" + $opalScope.CC_BLANK)), "anchor": (new RegExp("^\\[\\[(?:|([" + $opalScope.CC_ALPHA + ":_][\\w:.-]*)(?:," + $opalScope.CC_BLANK + "*(\\S.*))?)\\]\\]$")), "anchor_embedded": (new RegExp("^(.*?)" + $opalScope.CC_BLANK + "+(\\\\)?\\[\\[([" + $opalScope.CC_ALPHA + ":_][\\w:.-]*)(?:," + $opalScope.CC_BLANK + "*(\\S.*?))?\\]\\]$")), "anchor_macro": (new RegExp("\\\\?(?:\\[\\[([" + $opalScope.CC_ALPHA + ":_][\\w:.-]*)(?:," + $opalScope.CC_BLANK + "*(\\S.*?))?\\]\\]|anchor:(\\S+)\\[(.*?[^\\\\])?\\])")), "any_blk": /^(?:(?:-|\.|=|\*|_|\+|\/){4,}|[\|,;!]={3,}|(?:`|~){3,}.*)$/, "any_list": (new RegExp("^(?:<?\\d+>" + $opalScope.CC_BLANK + "+" + $opalScope.CC_GRAPH + "|" + $opalScope.CC_BLANK + "*(?:-|(?:\\*|\\.){1,5}|\\d+\\.|[a-zA-Z]\\.|[IVXivx]+\\))" + $opalScope.CC_BLANK + "+" + $opalScope.CC_GRAPH + "|" + $opalScope.CC_BLANK + "*.*?(?::{2,4}|;;)(?:" + $opalScope.CC_BLANK + "+" + $opalScope.CC_GRAPH + "|$))")), "attr_entry": (new RegExp("^:(!?\\w.*?):(?:" + $opalScope.CC_BLANK + "+(.*))?$")), "blk_attr_list": (new RegExp("^\\[(|" + $opalScope.CC_BLANK + "*[\\w\\{,.#\"'%].*)\\]$")), "attr_line": (new RegExp("^\\[(|" + $opalScope.CC_BLANK + "*[\\w\\{,.#\"'%].*|\\[(?:|[" + $opalScope.CC_ALPHA + ":_][\\w:.-]*(?:," + $opalScope.CC_BLANK + "*\\S.*)?)\\])\\]$")), "attr_ref": /(\\)?\{((set|counter2?):.+?|\w+(?:[\-]\w+)*)(\\)?\}/, "author_info": /^(\w[\w\-'.]*)(?: +(\w[\w\-'.]*))?(?: +(\w[\w\-'.]*))?(?: +<([^>]+)>)?$/, "biblio_macro": /\\?\[\[\[([\w:][\w:.-]*?)\]\]\]/, "callout_render": (new RegExp("(?:(?:\\/\\/|#|;;) ?)?(\\\\)?&lt;!?(--|)(\\d+)\\2&gt;(?=(?: ?\\\\?&lt;!?\\2\\d+\\2&gt;)*" + $opalScope.CC_EOL + ")")), "callout_quick_scan": (new RegExp("\\\\?<!?(--|)(\\d+)\\1>(?=(?: ?\\\\?<!?\\1\\d+\\1>)*" + $opalScope.CC_EOL + ")")), "callout_scan": (new RegExp("(?:(?:\\/\\/|#|;;) ?)?(\\\\)?<!?(--|)(\\d+)\\2>(?=(?: ?\\\\?<!?\\2\\d+\\2>)*" + $opalScope.CC_EOL + ")")), "colist": (new RegExp("^<?(\\d+)>" + $opalScope.CC_BLANK + "+(.*)")), "comment_blk": /^\/{4,}$/, "comment": /^\/\/(?:[^\/]|$)/, "ssv_or_csv_delim": /,|;/, "space_delim": (new RegExp("([^\\\\])" + $opalScope.CC_BLANK + "+")), "kbd_delim": (new RegExp("(?:\\+|,)(?=" + $opalScope.CC_BLANK + "*[^\\1])")), "escaped_space": (new RegExp("\\\\(" + $opalScope.CC_BLANK + ")")), "digits": /^\d+$/, "dlist": (new RegExp("^(?!\\/\\/)" + $opalScope.CC_BLANK + "*(.*?)(:{2,4}|;;)(?:" + $opalScope.CC_BLANK + "+(.*))?$")), "dlist_siblings": $hash2(["::", ":::", "::::", ";;"], {"::": (new RegExp("^(?!\\/\\/)" + $opalScope.CC_BLANK + "*((?:.*[^:])?)(::)(?:" + $opalScope.CC_BLANK + "+(.*))?$")), ":::": (new RegExp("^(?!\\/\\/)" + $opalScope.CC_BLANK + "*((?:.*[^:])?)(:::)(?:" + $opalScope.CC_BLANK + "+(.*))?$")), "::::": (new RegExp("^(?!\\/\\/)" + $opalScope.CC_BLANK + "*((?:.*[^:])?)(::::)(?:" + $opalScope.CC_BLANK + "+(.*))?$")), ";;": (new RegExp("^(?!\\/\\/)" + $opalScope.CC_BLANK + "*(.*)(;;)(?:" + $opalScope.CC_BLANK + "+(.*))?$"))}), "illegal_sectid_chars": /&(?:[a-zA-Z]{2,}|#\d{2,4}|#x[a-fA-F0-9]{2,4});|\W+?/, "footnote_macro": /\\?(footnote(?:ref)?):\[(.*?[^\\])\]/i, "generic_blk_macro": /^(\w[\w\-]*)::(\S+?)\[((?:\\\]|[^\]])*?)\]$/, "kbd_btn_macro": /\\?(?:kbd|btn):\[((?:\\\]|[^\]])+?)\]/, "menu_macro": (new RegExp("\\\\?menu:(\\w|\\w.*?\\S)\\[" + $opalScope.CC_BLANK + "*(.+?)?\\]")), "menu_inline_macro": (new RegExp("\\\\?\"(\\w[^\"]*?" + $opalScope.CC_BLANK + "*&gt;" + $opalScope.CC_BLANK + "*[^\" \\t][^\"]*)\"")), "media_blk_macro": /^(image|video|audio)::(\S+?)\[((?:\\\]|[^\]])*?)\]$/, "image_macro": /\\?(?:image|icon):([^:\[][^\[]*)\[((?:\\\]|[^\]])*?)\]/, "indexterm_macro": /\\?(?:(indexterm2?):\[(.*?[^\\])\]|\(\((.+?)\)\)(?!\)))/i, "leading_blanks": (new RegExp("^(" + $opalScope.CC_BLANK + "*)")), "leading_parent_dirs": /^(?:\.\.\/)*/, "line_break": (new RegExp("^(.*)" + $opalScope.CC_BLANK + "\\+" + $opalScope.CC_EOL)), "link_inline": /(^|link:|&lt;|[\s>\(\)\[\];])(\\?(?:https?|ftp|irc):\/\/[^\s\[\]<]*[^\s.,\[\]<])(?:\[((?:\\\]|[^\]])*?)\])?/, "link_macro": /\\?(?:link|mailto):([^\s\[]+)(?:\[((?:\\\]|[^\]])*?)\])/, "email_inline": (new RegExp("[\\\\>:]?\\w[\\w.%+-]*@[" + $opalScope.CC_ALNUM + "][" + $opalScope.CC_ALNUM + ".-]*\\.[" + $opalScope.CC_ALPHA + "]{2,4}\\b")), "lit_par": (new RegExp("^(" + $opalScope.CC_BLANK + "+.*)$")), "olist": (new RegExp("^" + $opalScope.CC_BLANK + "*(\\.{1,5}|\\d+\\.|[a-zA-Z]\\.|[IVXivx]+\\))" + $opalScope.CC_BLANK + "+(.*)$")), "break_line": /^('|<){3,}$/, "break_line_plus": /^(?:'|<){3,}$|^ {0,3}([-\*_])( *)\1\2\1$/, "pass_macro": /\\?(?:(\+{3}|\${2})(.*?)\1|pass:([a-z,]*)\[(.*?[^\\])\])/i, "inline_math_macro": /\\?((?:latex|ascii)?math):([a-z,]*)\[(.*?[^\\])\]/i, "pass_macro_basic": /^pass:([a-z,]*)\[(.*)\]$/, "pass_lit": /(^|[^`\w])(?:\[([^\]]+?)\])?(\\?`([^`\s]|[^`\s].*?\S)`)(?![`\w])/i, "revision_info": /^(?:\D*(.*?),)?(?:\s*(?!:)(.*?))(?:\s*(?!^):\s*(.*))?$/, "single_quote_esc": /(\w)\\'(\w)/, "illegal_attr_name_chars": /[^\w\-]/, "table_colspec": /^(?:(\d+)\*)?([<^>](?:\.[<^>]?)?|(?:[<^>]?\.)?[<^>])?(\d+%?)?([a-z])?$/, "table_cellspec": $hash2(["start", "end"], {"start": (new RegExp("^" + $opalScope.CC_BLANK + "*(?:(\\d+(?:\\.\\d*)?|(?:\\d*\\.)?\\d+)([*+]))?([<^>](?:\\.[<^>]?)?|(?:[<^>]?\\.)?[<^>])?([a-z])?\\|")), "end": (new RegExp("" + $opalScope.CC_BLANK + "+(?:(\\d+(?:\\.\\d*)?|(?:\\d*\\.)?\\d+)([*+]))?([<^>](?:\\.[<^>]?)?|(?:[<^>]?\\.)?[<^>])?([a-z])?$"))}), "trailing_digit": /\d+$/, "blk_title": /^\.([^\s.].*)$/, "dbl_quoted": /^("|)(.*)\1$/, "m_dbl_quoted": /^("|)(.*)\1$/i, "section_float_style": /^(?:float|discrete)\b/, "section_title": (new RegExp("^((?:=|#){1,6})" + $opalScope.CC_BLANK + "+(\\S.*?)(?:" + $opalScope.CC_BLANK + "+\\1)?$")), "section_name": /^((?=.*\w+.*)[^.].*?)$/, "section_underline": /^(?:=|-|~|\^|\+)+$/, "toc": /^toc::\[(.*?)\]$/, "ulist": (new RegExp("^" + $opalScope.CC_BLANK + "*(-|\\*{1,5})" + $opalScope.CC_BLANK + "+(.*)$")), "xref_macro": /\\?(?:&lt;&lt;([\w":].*?)&gt;&gt;|xref:([\w":].*?)\[(.*?)\])/i, "ifdef_macro": /^[\\]?(ifdef|ifndef|ifeval|endif)::(\S*?(?:([,\+])\S+?)?)\[(.+)?\]$/, "eval_expr": (new RegExp("^(\\S.*?)" + $opalScope.CC_BLANK + "*(==|!=|<=|>=|<|>)" + $opalScope.CC_BLANK + "*(\\S.*)$")), "include_macro": /^\\?include::([^\[]+)\[(.*?)\]$/, "uri_sniff": (new RegExp("^[" + $opalScope.CC_ALPHA + "][" + $opalScope.CC_ALNUM + ".+-]*:/{0,2}")), "uri_encode_chars": /[^\w\-.!~*';:@=+$,()\[\]]/, "mantitle_manvolnum": /^(.*)\((.*)\)$/, "manname_manpurpose": (new RegExp("^(.*?)" + $opalScope.CC_BLANK + "+-" + $opalScope.CC_BLANK + "+(.*)$"))}));

    $opal.cdecl($opalScope, 'INTRINSICS', ($a = ($c = (($d = $opal.Object._scope.Hash) == null ? $opal.cm('Hash') : $d)).$new, $a._p = (TMP_2 = function(h, k){var self = TMP_2._s || this;if (h == null) h = nil;if (k == null) k = nil;
    $opalScope.STDERR.$puts("Missing intrinsic: " + (k.$inspect()));
      return "{" + (k) + "}";}, TMP_2._s = self, TMP_2), $a).call($c).$merge($hash2(["startsb", "endsb", "vbar", "caret", "asterisk", "tilde", "plus", "apostrophe", "backslash", "backtick", "empty", "sp", "space", "two-colons", "two-semicolons", "nbsp", "deg", "zwsp", "quot", "apos", "lsquo", "rsquo", "ldquo", "rdquo", "wj", "brvbar", "amp", "lt", "gt"], {"startsb": "[", "endsb": "]", "vbar": "|", "caret": "^", "asterisk": "*", "tilde": "~", "plus": "&#43;", "apostrophe": "'", "backslash": "\\", "backtick": "`", "empty": "", "sp": " ", "space": " ", "two-colons": "::", "two-semicolons": ";;", "nbsp": "&#160;", "deg": "&#176;", "zwsp": "&#8203;", "quot": "&#34;", "apos": "&#39;", "lsquo": "&#8216;", "rsquo": "&#8217;", "ldquo": "&#8220;", "rdquo": "&#8221;", "wj": "&#8288;", "brvbar": "&#166;", "amp": "&", "lt": "<", "gt": ">"})));

    $opal.cdecl($opalScope, 'SPECIAL_CHARS', $hash2(["<", ">", "&"], {"<": "&lt;", ">": "&gt;", "&": "&amp;"}));

    $opal.cdecl($opalScope, 'SPECIAL_CHARS_PATTERN', (new RegExp("[" + $opalScope.SPECIAL_CHARS.$keys().$join() + "]")));

    $opal.cdecl($opalScope, 'QUOTE_SUBS', [["strong", "unconstrained", /\\?(?:\[([^\]]+?)\])?\*\*(.+?)\*\*/i], ["strong", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?\*(\S|\S.*?\S)\*(?=\W|$)/i], ["double", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?``(\S|\S.*?\S)''(?=\W|$)/i], ["emphasis", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?'(\S|\S.*?\S)'(?=\W|$)/i], ["single", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?`(\S|\S.*?\S)'(?=\W|$)/i], ["monospaced", "unconstrained", /\\?(?:\[([^\]]+?)\])?\+\+(.+?)\+\+/i], ["monospaced", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?\+(\S|\S.*?\S)\+(?=\W|$)/i], ["emphasis", "unconstrained", /\\?(?:\[([^\]]+?)\])?\_\_(.+?)\_\_/i], ["emphasis", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?_(\S|\S.*?\S)_(?=\W|$)/i], ["none", "unconstrained", /\\?(?:\[([^\]]+?)\])?##(.+?)##/i], ["none", "constrained", /(^|[^\w;:}])(?:\[([^\]]+?)\])?#(\S|\S.*?\S)#(?=\W|$)/i], ["superscript", "unconstrained", /\\?(?:\[([^\]]+?)\])?\^(.+?)\^/i], ["subscript", "unconstrained", /\\?(?:\[([^\]]+?)\])?\~(.+?)\~/i]]);

    $opal.cdecl($opalScope, 'REPLACEMENTS', [[/\\?\(C\)/, "&#169;", "none"], [/\\?\(R\)/, "&#174;", "none"], [/\\?\(TM\)/, "&#8482;", "none"], [/(^|\n| |\\)--( |\n|$)/, "&#8201;&#8212;&#8201;", "none"], [/(\w)\\?--(?=\w)/, "&#8212;", "leading"], [/\\?\.\.\./, "&#8230;", "leading"], [(new RegExp("([" + $opalScope.CC_ALPHA + "])\\\\?'(?!')")), "&#8217;", "leading"], [/\\?-&gt;/, "&#8594;", "none"], [/\\?=&gt;/, "&#8658;", "none"], [/\\?&lt;-/, "&#8592;", "none"], [/\\?&lt;=/, "&#8656;", "none"], [/\\?(&)amp;((?:[a-zA-Z]+|#\d{2,4}|#x[a-fA-F0-9]{2,4});)/, "", "bounding"]]);

    $opal.defs(self, '$load', function(input, options) {
      var $a, $b, $c, $d, TMP_3, TMP_4, TMP_5, $e, self = this, monitor = nil, start = nil, attrs = nil, original_attrs = nil, lines = nil, input_mtime = nil, input_path = nil, docdate = nil, doctime = nil, read_time = nil, doc = nil, parse_time = nil;
      if (options == null) {
        options = $hash2([], {})
      }
      if (($a = (monitor = options.$fetch("monitor", false))) !== false && $a !== nil) {
        start = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()};
      attrs = (($a = "attributes", $b = options, ((($c = $b['$[]']($a)) !== false && $c !== nil) ? $c : $b['$[]=']($a, $hash2([], {})))));
      if (($a = ((($b = attrs['$is_a?']((($c = $opal.Object._scope.Hash) == null ? $opal.cm('Hash') : $c))) !== false && $b !== nil) ? $b : (($c = (($d = $opal.Object._scope.RUBY_ENGINE_JRUBY) == null ? $opal.cm('RUBY_ENGINE_JRUBY') : $d), $c !== false && $c !== nil ?attrs['$is_a?']((((($d = $opal.Object._scope.Java) == null ? $opal.cm('Java') : $d))._scope.JavaUtil)._scope.Map) : $c)))) === false || $a === nil) {
        if (($a = attrs['$is_a?']((($b = $opal.Object._scope.Array) == null ? $opal.cm('Array') : $b))) !== false && $a !== nil) {
          attrs = options['$[]=']("attributes", ($a = ($b = attrs).$opalInject, $a._p = (TMP_3 = function(accum, entry){var self = TMP_3._s || this, $a, k = nil, v = nil;if (accum == null) accum = nil;if (entry == null) entry = nil;
          $a = $opal.to_ary(entry.$split("=", 2)), k = ($a[0] == null ? nil : $a[0]), v = ($a[1] == null ? nil : $a[1]);
            accum['$[]='](k, ((($a = v) !== false && $a !== nil) ? $a : ""));
            return accum;}, TMP_3._s = self, TMP_3), $a).call($b, $hash2([], {})))
        } else if (($a = attrs['$is_a?']((($c = $opal.Object._scope.String) == null ? $opal.cm('String') : $c))) !== false && $a !== nil) {
          attrs = attrs.$gsub($opalScope.REGEXP['$[]']("space_delim"), "\\10").$gsub($opalScope.REGEXP['$[]']("escaped_space"), "1");
          attrs = options['$[]=']("attributes", ($a = ($c = attrs.$split("0")).$opalInject, $a._p = (TMP_4 = function(accum, entry){var self = TMP_4._s || this, $a, k = nil, v = nil;if (accum == null) accum = nil;if (entry == null) entry = nil;
          $a = $opal.to_ary(entry.$split("=", 2)), k = ($a[0] == null ? nil : $a[0]), v = ($a[1] == null ? nil : $a[1]);
            accum['$[]='](k, ((($a = v) !== false && $a !== nil) ? $a : ""));
            return accum;}, TMP_4._s = self, TMP_4), $a).call($c, $hash2([], {})));
        } else if (($a = ($d = attrs['$respond_to?']("keys"), $d !== false && $d !== nil ?attrs['$respond_to?']("[]") : $d)) !== false && $a !== nil) {
          original_attrs = attrs;
          attrs = options['$[]=']("attributes", $hash2([], {}));
          ($a = ($d = original_attrs.$keys()).$each, $a._p = (TMP_5 = function(key){var self = TMP_5._s || this;if (key == null) key = nil;
          return attrs['$[]='](key, original_attrs['$[]'](key))}, TMP_5._s = self, TMP_5), $a).call($d);
          } else {
          self.$raise((($a = $opal.Object._scope.ArgumentError) == null ? $opal.cm('ArgumentError') : $a), "illegal type for attributes option: " + (attrs.$class().$ancestors()))
        }};
      lines = nil;
      if (($a = input['$is_a?']((($e = $opal.Object._scope.File) == null ? $opal.cm('File') : $e))) !== false && $a !== nil) {
        lines = input.$readlines();
        input_mtime = input.$mtime();
        input_path = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$expand_path(input.$path());
        attrs['$[]=']("docfile", input_path);
        attrs['$[]=']("docdir", (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname(input_path));
        attrs['$[]=']("docname", (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$basename(input_path, (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$extname(input_path)));
        attrs['$[]=']("docdate", docdate = input_mtime.$strftime("%Y-%m-%d"));
        attrs['$[]=']("doctime", doctime = input_mtime.$strftime("%H:%M:%S %Z"));
        attrs['$[]=']("docdatetime", "" + (docdate) + " " + (doctime));
      } else if (($a = input['$respond_to?']("readlines")) !== false && $a !== nil) {
        try {input.$rewind() } catch ($err) { nil };
        lines = input.$readlines();
      } else if (($a = input['$is_a?']((($e = $opal.Object._scope.String) == null ? $opal.cm('String') : $e))) !== false && $a !== nil) {
        lines = input.$lines().$entries()
      } else if (($a = input['$is_a?']((($e = $opal.Object._scope.Array) == null ? $opal.cm('Array') : $e))) !== false && $a !== nil) {
        lines = input.$dup()
        } else {
        self.$raise((($a = $opal.Object._scope.ArgumentError) == null ? $opal.cm('ArgumentError') : $a), "Unsupported input type: " + (input.$class()))
      };
      if (monitor !== false && monitor !== nil) {
        read_time = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()['$-'](start);
        start = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f();};
      doc = $opalScope.Document.$new(lines, options);
      if (monitor !== false && monitor !== nil) {
        parse_time = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()['$-'](start);
        monitor['$[]=']("read", read_time);
        monitor['$[]=']("parse", parse_time);
        monitor['$[]=']("load", read_time['$+'](parse_time));};
      return doc;
    });

    $opal.defs(self, '$load_file', function(filename, options) {
      var $a, self = this;
      if (options == null) {
        options = $hash2([], {})
      }
      return (($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a).$load((($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$new(filename), options);
    });

    $opal.defs(self, '$render', function(input, options) {
      var $a, $b, $c, TMP_6, $d, $e, $f, $g, TMP_7, TMP_8, TMP_9, TMP_10, self = this, in_place = nil, to_file = nil, to_dir = nil, mkdirs = nil, monitor = nil, write_in_place = nil, write_to_target = nil, stream_output = nil, doc = nil, working_dir = nil, jail = nil, start = nil, output = nil, render_time = nil, outfile = nil, write_time = nil, copy_asciidoctor_stylesheet = nil, stylesheet = nil, copy_user_stylesheet = nil, copy_coderay_stylesheet = nil, copy_pygments_stylesheet = nil, outdir = nil, stylesoutdir = nil, stylesheet_src = nil, stylesheet_dst = nil, stylesheet_content = nil;
      if (options == null) {
        options = $hash2([], {})
      }
      in_place = ((($a = options.$delete("in_place")) !== false && $a !== nil) ? $a : false);
      to_file = options.$delete("to_file");
      to_dir = options.$delete("to_dir");
      mkdirs = ((($a = options.$delete("mkdirs")) !== false && $a !== nil) ? $a : false);
      monitor = options.$fetch("monitor", false);
      write_in_place = (($a = in_place !== false && in_place !== nil) ? input['$is_a?']((($b = $opal.Object._scope.File) == null ? $opal.cm('File') : $b)) : $a);
      write_to_target = ((($a = to_file) !== false && $a !== nil) ? $a : to_dir);
      stream_output = ($a = ($b = to_file['$nil?'](), ($b === nil || $b === false)), $a !== false && $a !== nil ?to_file['$respond_to?']("write") : $a);
      if (($a = (($b = write_in_place !== false && write_in_place !== nil) ? write_to_target : $b)) !== false && $a !== nil) {
        self.$raise((($a = $opal.Object._scope.ArgumentError) == null ? $opal.cm('ArgumentError') : $a), "the option :in_place cannot be used with either the :to_dir or :to_file option")};
      if (($a = ($b = ($c = options['$has_key?']("header_footer"), ($c === nil || $c === false)), $b !== false && $b !== nil ?(((($c = write_in_place) !== false && $c !== nil) ? $c : write_to_target)) : $b)) !== false && $a !== nil) {
        options['$[]=']("header_footer", true)};
      doc = (($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a).$load(input, options);
      if (to_file['$==']("/dev/null")) {
        return doc
      } else if (write_in_place !== false && write_in_place !== nil) {
        to_file = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$join((($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname(input.$path()), "" + (doc.$attributes()['$[]']("docname")) + (doc.$attributes()['$[]']("outfilesuffix")))
      } else if (($a = ($b = ($c = stream_output, ($c === nil || $c === false)), $b !== false && $b !== nil ?write_to_target : $b)) !== false && $a !== nil) {
        working_dir = (function() {if (($a = options['$has_key?']("base_dir")) !== false && $a !== nil) {
          return (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$expand_path(options['$[]']("base_dir"))
          } else {
          return (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$expand_path((($a = $opal.Object._scope.Dir) == null ? $opal.cm('Dir') : $a).$pwd())
        }; return nil; })();
        jail = (function() {if (doc.$safe()['$>='](($opalScope.SafeMode)._scope.SAFE)) {
          return working_dir
          } else {
          return nil
        }; return nil; })();
        if (to_dir !== false && to_dir !== nil) {
          to_dir = doc.$normalize_system_path(to_dir, working_dir, jail, $hash2(["target_name", "recover"], {"target_name": "to_dir", "recover": false}));
          if (to_file !== false && to_file !== nil) {
            to_file = doc.$normalize_system_path(to_file, to_dir, nil, $hash2(["target_name", "recover"], {"target_name": "to_dir", "recover": false}));
            to_dir = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname(to_file);
            } else {
            to_file = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$join(to_dir, "" + (doc.$attributes()['$[]']("docname")) + (doc.$attributes()['$[]']("outfilesuffix")))
          };
        } else if (to_file !== false && to_file !== nil) {
          to_file = doc.$normalize_system_path(to_file, working_dir, jail, $hash2(["target_name", "recover"], {"target_name": "to_dir", "recover": false}));
          to_dir = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname(to_file);};
        if (($a = ($b = (($c = $opal.Object._scope.File) == null ? $opal.cm('File') : $c)['$directory?'](to_dir), ($b === nil || $b === false))) !== false && $a !== nil) {
          if (mkdirs !== false && mkdirs !== nil) {
            (($a = $opal.Object._scope.FileUtils) == null ? $opal.cm('FileUtils') : $a).$mkdir_p(to_dir)
            } else {
            self.$raise((($a = $opal.Object._scope.IOError) == null ? $opal.cm('IOError') : $a), "target directory does not exist: " + (to_dir))
          }};};
      if (monitor !== false && monitor !== nil) {
        start = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()};
      output = doc.$render();
      if (monitor !== false && monitor !== nil) {
        render_time = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()['$-'](start);
        monitor['$[]=']("render", render_time);
        monitor['$[]=']("load_render", monitor['$[]']("load")['$+'](render_time));};
      if (to_file !== false && to_file !== nil) {
        if (monitor !== false && monitor !== nil) {
          start = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()};
        if (stream_output !== false && stream_output !== nil) {
          to_file.$write(output.$rstrip());
          to_file.$write($opalScope.EOL);
          } else {
          ($a = ($b = (($c = $opal.Object._scope.File) == null ? $opal.cm('File') : $c)).$open, $a._p = (TMP_6 = function(file){var self = TMP_6._s || this;if (file == null) file = nil;
          return file.$write(output)}, TMP_6._s = self, TMP_6), $a).call($b, to_file, "w");
          doc.$attributes()['$[]=']("outfile", outfile = (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$expand_path(to_file));
          doc.$attributes()['$[]=']("outdir", (($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$dirname(outfile));
        };
        if (monitor !== false && monitor !== nil) {
          write_time = (($a = $opal.Object._scope.Time) == null ? $opal.cm('Time') : $a).$now().$to_f()['$-'](start);
          monitor['$[]=']("write", write_time);
          monitor['$[]=']("total", monitor['$[]']("load_render")['$+'](write_time));};
        if (($a = ($c = ($d = ($e = ($f = ($g = stream_output, ($g === nil || $g === false)), $f !== false && $f !== nil ?doc.$safe()['$<'](($opalScope.SafeMode)._scope.SECURE) : $f), $e !== false && $e !== nil ?(doc['$attr?']("basebackend-html")) : $e), $d !== false && $d !== nil ?(doc['$attr?']("linkcss")) : $d), $c !== false && $c !== nil ?(doc['$attr?']("copycss")) : $c)) !== false && $a !== nil) {
          copy_asciidoctor_stylesheet = $opalScope.DEFAULT_STYLESHEET_KEYS['$include?'](stylesheet = (doc.$attr("stylesheet")));
          copy_user_stylesheet = ($a = ($c = copy_asciidoctor_stylesheet, ($c === nil || $c === false)), $a !== false && $a !== nil ?($c = stylesheet.$to_s()['$empty?'](), ($c === nil || $c === false)) : $a);
          copy_coderay_stylesheet = ($a = (doc['$attr?']("source-highlighter", "coderay")), $a !== false && $a !== nil ?(doc.$attr("coderay-css", "class"))['$==']("class") : $a);
          copy_pygments_stylesheet = ($a = (doc['$attr?']("source-highlighter", "pygments")), $a !== false && $a !== nil ?(doc.$attr("pygments-css", "class"))['$==']("class") : $a);
          if (($a = ((($c = ((($d = ((($e = copy_asciidoctor_stylesheet) !== false && $e !== nil) ? $e : copy_user_stylesheet)) !== false && $d !== nil) ? $d : copy_coderay_stylesheet)) !== false && $c !== nil) ? $c : copy_pygments_stylesheet)) !== false && $a !== nil) {
            outdir = doc.$attr("outdir");
            stylesoutdir = doc.$normalize_system_path(doc.$attr("stylesdir"), outdir, (function() {if (doc.$safe()['$>='](($opalScope.SafeMode)._scope.SAFE)) {
              return outdir
              } else {
              return nil
            }; return nil; })());
            if (mkdirs !== false && mkdirs !== nil) {
              $opalScope.Helpers.$mkdir_p(stylesoutdir)};
            if (copy_asciidoctor_stylesheet !== false && copy_asciidoctor_stylesheet !== nil) {
              ($a = ($c = (($d = $opal.Object._scope.File) == null ? $opal.cm('File') : $d)).$open, $a._p = (TMP_7 = function(f){var self = TMP_7._s || this;if (f == null) f = nil;
              return f.$write($opalScope.HTML5.$default_asciidoctor_stylesheet())}, TMP_7._s = self, TMP_7), $a).call($c, (($d = $opal.Object._scope.File) == null ? $opal.cm('File') : $d).$join(stylesoutdir, $opalScope.DEFAULT_STYLESHEET_NAME), "w")};
            if (copy_user_stylesheet !== false && copy_user_stylesheet !== nil) {
              if (($a = ((stylesheet_src = (doc.$attr("copycss"))))['$empty?']()) !== false && $a !== nil) {
                stylesheet_src = doc.$normalize_system_path(stylesheet)
                } else {
                stylesheet_src = doc.$normalize_system_path(stylesheet_src)
              };
              stylesheet_dst = doc.$normalize_system_path(stylesheet, stylesoutdir, ((function() {if (doc.$safe()['$>='](($opalScope.SafeMode)._scope.SAFE)) {
                return outdir
                } else {
                return nil
              }; return nil; })()));
              if (($a = ((($d = stylesheet_src['$=='](stylesheet_dst)) !== false && $d !== nil) ? $d : ((stylesheet_content = doc.$read_asset(stylesheet_src)))['$nil?']())) === false || $a === nil) {
                ($a = ($d = (($e = $opal.Object._scope.File) == null ? $opal.cm('File') : $e)).$open, $a._p = (TMP_8 = function(f){var self = TMP_8._s || this;if (f == null) f = nil;
                return f.$write(stylesheet_content)}, TMP_8._s = self, TMP_8), $a).call($d, stylesheet_dst, "w")};};
            if (copy_coderay_stylesheet !== false && copy_coderay_stylesheet !== nil) {
              ($a = ($e = (($f = $opal.Object._scope.File) == null ? $opal.cm('File') : $f)).$open, $a._p = (TMP_9 = function(f){var self = TMP_9._s || this;if (f == null) f = nil;
              return f.$write($opalScope.HTML5.$default_coderay_stylesheet())}, TMP_9._s = self, TMP_9), $a).call($e, (($f = $opal.Object._scope.File) == null ? $opal.cm('File') : $f).$join(stylesoutdir, "asciidoctor-coderay.css"), "w")};
            if (copy_pygments_stylesheet !== false && copy_pygments_stylesheet !== nil) {
              ($a = ($f = (($g = $opal.Object._scope.File) == null ? $opal.cm('File') : $g)).$open, $a._p = (TMP_10 = function(f){var self = TMP_10._s || this;if (f == null) f = nil;
              return f.$write($opalScope.HTML5.$pygments_stylesheet(doc.$attr("pygments-style")))}, TMP_10._s = self, TMP_10), $a).call($f, (($g = $opal.Object._scope.File) == null ? $opal.cm('File') : $g).$join(stylesoutdir, "asciidoctor-pygments.css"), "w")};};};
        return doc;
        } else {
        return output
      };
    });

    $opal.defs(self, '$render_file', function(filename, options) {
      var $a, self = this;
      if (options == null) {
        options = $hash2([], {})
      }
      return (($a = $opal.Object._scope.Asciidoctor) == null ? $opal.cm('Asciidoctor') : $a).$render((($a = $opal.Object._scope.File) == null ? $opal.cm('File') : $a).$new(filename), options);
    });

    if (($a = (($d = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $d)) === false || $a === nil) {
      ;

      ;};

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    ;

    if (($a = (($d = $opal.Object._scope.RUBY_ENGINE_OPAL) == null ? $opal.cm('RUBY_ENGINE_OPAL') : $d)) !== false && $a !== nil) {
      };
    
  })(self);
})(Opal);

'use strict';

 angular.module('aql.asciidoc', []).
 	directive('asciidoc', function(){
		return {
			restrict: 'AE', // E = Element, A = Attribute, C = Class, M = Comment header_footer
			link: function(scope, element, attrs) {
 				var options;

 				// If options are define
				if (attrs.asciidocOpts) {
					options = scope.$eval(attrs.asciidocOpts);
				}

				if (attrs.asciidoc) {
					scope.$watch(attrs.asciidoc, function (newVal) {
			            var html = newVal ? Opal.Asciidoctor.$render(newVal, options) : '';
			            element.html(html);
			          });
				} else {
					element.html(Opal.Asciidoctor.$render(element.text(), options));
				}

			}
		};
	});