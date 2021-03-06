/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import ReactFiberReconciler from 'react-reconciler';
import * as ReactScheduler from 'react-scheduler';
import Mode from 'art/modes/current';
import FastNoSideEffects from 'art/modes/fast-noSideEffects';
import Transform from 'art/core/transform';
import invariant from 'fbjs/lib/invariant';
import emptyObject from 'fbjs/lib/emptyObject';

Mode.setCurrent(
  // Change to 'art/modes/dom' for easier debugging via SVG
  FastNoSideEffects,
);

const pooledTransform = new Transform();

const EVENT_TYPES = {
  onClick: 'click',
  onMouseMove: 'mousemove',
  onMouseOver: 'mouseover',
  onMouseOut: 'mouseout',
  onMouseUp: 'mouseup',
  onMouseDown: 'mousedown',
};

const TYPES = {
  CLIPPING_RECTANGLE: 'ClippingRectangle',
  GROUP: 'Group',
  SHAPE: 'Shape',
  TEXT: 'Text',
};

const UPDATE_SIGNAL = {};

/** Helper Methods */

function addEventListeners(instance, type, listener) {
  // We need to explicitly unregister before unmount.
  // For this reason we need to track subscriptions.
  if (!instance._listeners) {
    instance._listeners = {};
    instance._subscriptions = {};
  }

  instance._listeners[type] = listener;

  if (listener) {
    if (!instance._subscriptions[type]) {
      instance._subscriptions[type] = instance.subscribe(
        type,
        createEventHandler(instance),
        instance,
      );
    }
  } else {
    if (instance._subscriptions[type]) {
      instance._subscriptions[type]();
      delete instance._subscriptions[type];
    }
  }
}

function childrenAsString(children) {
  if (!children) {
    return '';
  } else if (typeof children === 'string') {
    return children;
  } else if (children.length) {
    return children.join('');
  } else {
    return '';
  }
}

function createEventHandler(instance) {
  return function handleEvent(event) {
    const listener = instance._listeners[event.type];

    if (!listener) {
      // Noop
    } else if (typeof listener === 'function') {
      listener.call(instance, event);
    } else if (listener.handleEvent) {
      listener.handleEvent(event);
    }
  };
}

function destroyEventListeners(instance) {
  if (instance._subscriptions) {
    for (let type in instance._subscriptions) {
      instance._subscriptions[type]();
    }
  }

  instance._subscriptions = null;
  instance._listeners = null;
}

function getScaleX(props) {
  if (props.scaleX != null) {
    return props.scaleX;
  } else if (props.scale != null) {
    return props.scale;
  } else {
    return 1;
  }
}

function getScaleY(props) {
  if (props.scaleY != null) {
    return props.scaleY;
  } else if (props.scale != null) {
    return props.scale;
  } else {
    return 1;
  }
}

function isSameFont(oldFont, newFont) {
  if (oldFont === newFont) {
    return true;
  } else if (typeof newFont === 'string' || typeof oldFont === 'string') {
    return false;
  } else {
    return (
      newFont.fontSize === oldFont.fontSize &&
      newFont.fontStyle === oldFont.fontStyle &&
      newFont.fontVariant === oldFont.fontVariant &&
      newFont.fontWeight === oldFont.fontWeight &&
      newFont.fontFamily === oldFont.fontFamily
    );
  }
}

/** Render Methods */

function applyClippingRectangleProps(instance, props, prevProps = {}) {
  applyNodeProps(instance, props, prevProps);

  instance.width = props.width;
  instance.height = props.height;
}

function applyGroupProps(instance, props, prevProps = {}) {
  applyNodeProps(instance, props, prevProps);

  instance.width = props.width;
  instance.height = props.height;
}

function applyNodeProps(instance, props, prevProps = {}) {
  const scaleX = getScaleX(props);
  const scaleY = getScaleY(props);

  pooledTransform
    .transformTo(1, 0, 0, 1, 0, 0)
    .move(props.x || 0, props.y || 0)
    .rotate(props.rotation || 0, props.originX, props.originY)
    .scale(scaleX, scaleY, props.originX, props.originY);

  if (props.transform != null) {
    pooledTransform.transform(props.transform);
  }

  if (
    instance.xx !== pooledTransform.xx ||
    instance.yx !== pooledTransform.yx ||
    instance.xy !== pooledTransform.xy ||
    instance.yy !== pooledTransform.yy ||
    instance.x !== pooledTransform.x ||
    instance.y !== pooledTransform.y
  ) {
    instance.transformTo(pooledTransform);
  }

  if (props.cursor !== prevProps.cursor || props.title !== prevProps.title) {
    instance.indicate(props.cursor, props.title);
  }

  if (instance.blend && props.opacity !== prevProps.opacity) {
    instance.blend(props.opacity == null ? 1 : props.opacity);
  }

  if (props.visible !== prevProps.visible) {
    if (props.visible == null || props.visible) {
      instance.show();
    } else {
      instance.hide();
    }
  }

  for (let type in EVENT_TYPES) {
    addEventListeners(instance, EVENT_TYPES[type], props[type]);
  }
}

function applyRenderableNodeProps(instance, props, prevProps = {}) {
  applyNodeProps(instance, props, prevProps);

  if (prevProps.fill !== props.fill) {
    if (props.fill && props.fill.applyFill) {
      props.fill.applyFill(instance);
    } else {
      instance.fill(props.fill);
    }
  }
  if (
    prevProps.stroke !== props.stroke ||
    prevProps.strokeWidth !== props.strokeWidth ||
    prevProps.strokeCap !== props.strokeCap ||
    prevProps.strokeJoin !== props.strokeJoin ||
    // TODO: Consider deep check of stokeDash; may benefit VML in IE.
    prevProps.strokeDash !== props.strokeDash
  ) {
    instance.stroke(
      props.stroke,
      props.strokeWidth,
      props.strokeCap,
      props.strokeJoin,
      props.strokeDash,
    );
  }
}

function applyShapeProps(instance, props, prevProps = {}) {
  applyRenderableNodeProps(instance, props, prevProps);

  const path = props.d || childrenAsString(props.children);

  const prevDelta = instance._prevDelta;
  const prevPath = instance._prevPath;

  if (
    path !== prevPath ||
    path.delta !== prevDelta ||
    prevProps.height !== props.height ||
    prevProps.width !== props.width
  ) {
    instance.draw(path, props.width, props.height);

    instance._prevDelta = path.delta;
    instance._prevPath = path;
  }
}

function applyTextProps(instance, props, prevProps = {}) {
  applyRenderableNodeProps(instance, props, prevProps);

  const string = props.children;

  if (
    instance._currentString !== string ||
    !isSameFont(props.font, prevProps.font) ||
    props.alignment !== prevProps.alignment ||
    props.path !== prevProps.path
  ) {
    instance.draw(string, props.font, props.alignment, props.path);

    instance._currentString = string;
  }
}

/** Declarative fill-type objects; API design not finalized */

const slice = Array.prototype.slice;

class LinearGradient {
  constructor(stops, x1, y1, x2, y2) {
    this._args = slice.call(arguments);
  }

  applyFill(node) {
    node.fillLinear.apply(node, this._args);
  }
}

class RadialGradient {
  constructor(stops, fx, fy, rx, ry, cx, cy) {
    this._args = slice.call(arguments);
  }

  applyFill(node) {
    node.fillRadial.apply(node, this._args);
  }
}

class Pattern {
  constructor(url, width, height, left, top) {
    this._args = slice.call(arguments);
  }

  applyFill(node) {
    node.fillImage.apply(node, this._args);
  }
}

/** React Components */

class Surface extends React.Component {
  componentDidMount() {
    const {height, width} = this.props;

    this._surface = Mode.Surface(+width, +height, this._tagRef);

    this._mountNode = ARTRenderer.createContainer(this._surface);
    ARTRenderer.updateContainer(this.props.children, this._mountNode, this);
  }

  componentDidUpdate(prevProps, prevState) {
    const props = this.props;

    if (props.height !== prevProps.height || props.width !== prevProps.width) {
      this._surface.resize(+props.width, +props.height);
    }

    ARTRenderer.updateContainer(this.props.children, this._mountNode, this);

    if (this._surface.render) {
      this._surface.render();
    }
  }

  componentWillUnmount() {
    ARTRenderer.updateContainer(null, this._mountNode, this);
  }

  render() {
    // This is going to be a placeholder because we don't know what it will
    // actually resolve to because ART may render canvas, vml or svg tags here.
    // We only allow a subset of properties since others might conflict with
    // ART's properties.
    const props = this.props;

    // TODO: ART's Canvas Mode overrides surface title and cursor
    const Tag = Mode.Surface.tagName;

    return (
      <Tag
        ref={ref => (this._tagRef = ref)}
        accessKey={props.accessKey}
        className={props.className}
        draggable={props.draggable}
        role={props.role}
        style={props.style}
        tabIndex={props.tabIndex}
        title={props.title}
      />
    );
  }
}

class Text extends React.Component {
  constructor(props) {
    super(props);
    // We allow reading these props. Ideally we could expose the Text node as
    // ref directly.
    ['height', 'width', 'x', 'y'].forEach(key => {
      Object.defineProperty(this, key, {
        get: function() {
          return this._text ? this._text[key] : undefined;
        },
      });
    });
  }
  render() {
    // This means you can't have children that render into strings...
    const T = TYPES.TEXT;
    return (
      <T {...this.props} ref={t => (this._text = t)}>
        {childrenAsString(this.props.children)}
      </T>
    );
  }
}

/** ART Renderer */

const ARTRenderer = ReactFiberReconciler({
  appendInitialChild(parentInstance, child) {
    if (typeof child === 'string') {
      // Noop for string children of Text (eg <Text>{'foo'}{'bar'}</Text>)
      invariant(false, 'Text children should already be flattened.');
      return;
    }

    child.inject(parentInstance);
  },

  createInstance(type, props, internalInstanceHandle) {
    let instance;

    switch (type) {
      case TYPES.CLIPPING_RECTANGLE:
        instance = Mode.ClippingRectangle();
        instance._applyProps = applyClippingRectangleProps;
        break;
      case TYPES.GROUP:
        instance = Mode.Group();
        instance._applyProps = applyGroupProps;
        break;
      case TYPES.SHAPE:
        instance = Mode.Shape();
        instance._applyProps = applyShapeProps;
        break;
      case TYPES.TEXT:
        instance = Mode.Text(
          props.children,
          props.font,
          props.alignment,
          props.path,
        );
        instance._applyProps = applyTextProps;
        break;
    }

    invariant(instance, 'ReactART does not support the type "%s"', type);

    instance._applyProps(instance, props);

    return instance;
  },

  createTextInstance(text, rootContainerInstance, internalInstanceHandle) {
    return text;
  },

  finalizeInitialChildren(domElement, type, props) {
    return false;
  },

  getPublicInstance(instance) {
    return instance;
  },

  prepareForCommit() {
    // Noop
  },

  prepareUpdate(domElement, type, oldProps, newProps) {
    return UPDATE_SIGNAL;
  },

  resetAfterCommit() {
    // Noop
  },

  resetTextContent(domElement) {
    // Noop
  },

  shouldDeprioritizeSubtree(type, props) {
    return false;
  },

  getRootHostContext() {
    return emptyObject;
  },

  getChildHostContext() {
    return emptyObject;
  },

  scheduleDeferredCallback: ReactScheduler.rIC,

  shouldSetTextContent(type, props) {
    return (
      typeof props.children === 'string' || typeof props.children === 'number'
    );
  },

  now: ReactScheduler.now,

  mutation: {
    appendChild(parentInstance, child) {
      if (child.parentNode === parentInstance) {
        child.eject();
      }
      child.inject(parentInstance);
    },

    appendChildToContainer(parentInstance, child) {
      if (child.parentNode === parentInstance) {
        child.eject();
      }
      child.inject(parentInstance);
    },

    insertBefore(parentInstance, child, beforeChild) {
      invariant(
        child !== beforeChild,
        'ReactART: Can not insert node before itself',
      );
      child.injectBefore(beforeChild);
    },

    insertInContainerBefore(parentInstance, child, beforeChild) {
      invariant(
        child !== beforeChild,
        'ReactART: Can not insert node before itself',
      );
      child.injectBefore(beforeChild);
    },

    removeChild(parentInstance, child) {
      destroyEventListeners(child);
      child.eject();
    },

    removeChildFromContainer(parentInstance, child) {
      destroyEventListeners(child);
      child.eject();
    },

    commitTextUpdate(textInstance, oldText, newText) {
      // Noop
    },

    commitMount(instance, type, newProps) {
      // Noop
    },

    commitUpdate(instance, updatePayload, type, oldProps, newProps) {
      instance._applyProps(instance, newProps, oldProps);
    },
  },
});

/** API */

export const ClippingRectangle = TYPES.CLIPPING_RECTANGLE;
export const Group = TYPES.GROUP;
export const Shape = TYPES.SHAPE;
export const Path = Mode.Path;
export {LinearGradient, Pattern, RadialGradient, Surface, Text, Transform};
