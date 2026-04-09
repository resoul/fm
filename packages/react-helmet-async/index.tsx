import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import React, { Component } from 'react';
import fastCompare from 'react-fast-compare';
import invariant from 'invariant';

import { Context } from './Provider';
import type { HelmetDataType } from './HelmetData';
import HelmetData from './HelmetData';
import type { DispatcherContextProp } from './Dispatcher';
import Dispatcher from './Dispatcher';
import { without } from './utils';
import { TAG_NAMES, VALID_TAG_NAMES, HTML_TAG_MAP } from './constants';
import type { HelmetProps } from './types';

export * from './types';

export { default as HelmetData } from './HelmetData';
export { default as HelmetProvider } from './Provider';

type Props = { [key: string]: any };
type ChildProps = { children?: ReactNode } & Record<string, any>;
type ArrayTypeChildren = Record<string, Props[]>;

export class Helmet extends Component<PropsWithChildren<HelmetProps>> {
  static defaultProps = {
    defer: true,
    encodeSpecialCharacters: true,
    prioritizeSeoTags: false,
  };

  shouldComponentUpdate(nextProps: HelmetProps) {
    return !fastCompare(without(this.props, 'helmetData'), without(nextProps, 'helmetData'));
  }

  mapNestedChildrenToProps(child: ReactElement, nestedChildren: ReactNode) {
    if (!nestedChildren) {
      return null;
    }

    switch (child.type) {
      case TAG_NAMES.SCRIPT:
      case TAG_NAMES.NOSCRIPT:
        return {
          innerHTML: nestedChildren,
        };

      case TAG_NAMES.STYLE:
        return {
          cssText: nestedChildren,
        };
      default:
        throw new Error(
          `<${child.type} /> elements are self-closing and can not contain children. Refer to our API for more information.`
        );
    }
  }

  flattenArrayTypeChildren(
    child: ReactElement,
    arrayTypeChildren: ArrayTypeChildren,
    newChildProps: Props,
    nestedChildren: ReactNode
  ) {
    const childType = String(child.type);

    return {
      ...arrayTypeChildren,
      [childType]: [
        ...(arrayTypeChildren[childType] || []),
        {
          ...newChildProps,
          ...this.mapNestedChildrenToProps(child, nestedChildren),
        },
      ],
    };
  }

  mapObjectTypeChildren(
    child: ReactElement,
    newProps: Props,
    newChildProps: Props,
    nestedChildren: ReactNode
  ) {
    switch (child.type) {
      case TAG_NAMES.TITLE:
        return {
          ...newProps,
          [child.type]: nestedChildren,
          titleAttributes: { ...newChildProps },
        };

      case TAG_NAMES.BODY:
        return {
          ...newProps,
          bodyAttributes: { ...newChildProps },
        };

      case TAG_NAMES.HTML:
        return {
          ...newProps,
          htmlAttributes: { ...newChildProps },
        };
      default:
        return {
          ...newProps,
          [String(child.type)]: { ...newChildProps },
        };
    }
  }

  mapArrayTypeChildrenToProps(arrayTypeChildren: ArrayTypeChildren, newProps: Props) {
    let newFlattenedProps = { ...newProps };

    Object.keys(arrayTypeChildren).forEach(arrayChildName => {
      newFlattenedProps = {
        ...newFlattenedProps,
        [arrayChildName]: arrayTypeChildren[arrayChildName],
      };
    });

    return newFlattenedProps;
  }

  warnOnInvalidChildren(child: ReactElement, nestedChildren: ReactNode) {
    invariant(
      VALID_TAG_NAMES.some(name => child.type === name),
      typeof child.type === 'function'
        ? `You may be attempting to nest <Helmet> components within each other, which is not allowed. Refer to our API for more information.`
        : `Only elements types ${VALID_TAG_NAMES.join(
            ', '
          )} are allowed. Helmet does not support rendering <${
            child.type
          }> elements. Refer to our API for more information.`
    );

    invariant(
      !nestedChildren ||
        typeof nestedChildren === 'string' ||
        (Array.isArray(nestedChildren) &&
          !nestedChildren.some(nestedChild => typeof nestedChild !== 'string')),
      `Helmet expects a string as a child of <${child.type}>. Did you forget to wrap your children in braces? ( <${child.type}>{\`\`}</${child.type}> ) Refer to our API for more information.`
    );

    return true;
  }

  mapChildrenToProps(children: ReactNode, newProps: Props) {
    let arrayTypeChildren: ArrayTypeChildren = {};

    React.Children.forEach(children, childNode => {
      if (!React.isValidElement(childNode) || !childNode.props) {
        return;
      }
      const child = childNode as ReactElement<ChildProps>;
      const { children: nestedChildren = null, ...childProps } = child.props;

      // convert React props to HTML attributes
      const newChildProps = Object.keys(childProps).reduce((obj: Props, key) => {
        obj[HTML_TAG_MAP[key] || key] = childProps[key];
        return obj;
      }, {});

      const childType = child.type as unknown;
      if (typeof childType !== 'symbol') {
        this.warnOnInvalidChildren(child, nestedChildren);
      }
      const normalizedType =
        typeof childType === 'symbol' ? childType.toString() : String(childType);

      switch (normalizedType) {
        case TAG_NAMES.FRAGMENT:
          newProps = this.mapChildrenToProps(nestedChildren, newProps);
          break;

        case TAG_NAMES.LINK:
        case TAG_NAMES.META:
        case TAG_NAMES.NOSCRIPT:
        case TAG_NAMES.SCRIPT:
        case TAG_NAMES.STYLE:
          arrayTypeChildren = this.flattenArrayTypeChildren(
            child,
            arrayTypeChildren,
            newChildProps,
            nestedChildren
          );
          break;

        default:
          newProps = this.mapObjectTypeChildren(child, newProps, newChildProps, nestedChildren);
          break;
      }
    });

    return this.mapArrayTypeChildrenToProps(arrayTypeChildren, newProps);
  }

  render() {
    const { children, ...props } = this.props;
    let newProps = { ...props };
    let { helmetData } = props;

    if (children) {
      newProps = this.mapChildrenToProps(children, newProps);
    }

    if (helmetData && !(helmetData instanceof HelmetData)) {
      const data = helmetData as HelmetDataType;
      helmetData = new HelmetData(data.context, true);
      delete newProps.helmetData;
    }

    return helmetData ? (
      <Dispatcher {...newProps} context={helmetData.value} />
    ) : (
      <Context.Consumer>
        {context => <Dispatcher {...newProps} context={context as DispatcherContextProp} />}
      </Context.Consumer>
    );
  }
}
