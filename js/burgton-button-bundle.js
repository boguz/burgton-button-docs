/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * True if the custom elements polyfill is in use.
 */
const isCEPolyfill = typeof window !== 'undefined' &&
    window.customElements != null &&
    window.customElements.polyfillWrapFlushCallback !==
        undefined;
/**
 * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
 * `container`.
 */
const removeNodes = (container, start, end = null) => {
    while (start !== end) {
        const n = start.nextSibling;
        container.removeChild(start);
        start = n;
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An expression marker with embedded unique key to avoid collision with
 * possible text in templates.
 */
const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
/**
 * An expression marker used text-positions, multi-binding attributes, and
 * attributes with markup-like text values.
 */
const nodeMarker = `<!--${marker}-->`;
const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
/**
 * Suffix appended to all bound attribute names.
 */
const boundAttributeSuffix = '$lit$';
/**
 * An updatable Template that tracks the location of dynamic parts.
 */
class Template {
    constructor(result, element) {
        this.parts = [];
        this.element = element;
        const nodesToRemove = [];
        const stack = [];
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        // Keeps track of the last index associated with a part. We try to delete
        // unnecessary nodes, but we never want to associate two different parts
        // to the same index. They must have a constant node between.
        let lastPartIndex = 0;
        let index = -1;
        let partIndex = 0;
        const { strings, values: { length } } = result;
        while (partIndex < length) {
            const node = walker.nextNode();
            if (node === null) {
                // We've exhausted the content inside a nested template element.
                // Because we still have parts (the outer for-loop), we know:
                // - There is a template in the stack
                // - The walker will find a nextNode outside the template
                walker.currentNode = stack.pop();
                continue;
            }
            index++;
            if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                if (node.hasAttributes()) {
                    const attributes = node.attributes;
                    const { length } = attributes;
                    // Per
                    // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                    // attributes are not guaranteed to be returned in document order.
                    // In particular, Edge/IE can return them out of order, so we cannot
                    // assume a correspondence between part index and attribute index.
                    let count = 0;
                    for (let i = 0; i < length; i++) {
                        if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                            count++;
                        }
                    }
                    while (count-- > 0) {
                        // Get the template literal section leading up to the first
                        // expression in this attribute
                        const stringForPart = strings[partIndex];
                        // Find the attribute name
                        const name = lastAttributeNameRegex.exec(stringForPart)[2];
                        // Find the corresponding attribute
                        // All bound attributes have had a suffix added in
                        // TemplateResult#getHTML to opt out of special attribute
                        // handling. To look up the attribute value we also need to add
                        // the suffix.
                        const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                        const attributeValue = node.getAttribute(attributeLookupName);
                        node.removeAttribute(attributeLookupName);
                        const statics = attributeValue.split(markerRegex);
                        this.parts.push({ type: 'attribute', index, name, strings: statics });
                        partIndex += statics.length - 1;
                    }
                }
                if (node.tagName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
            }
            else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                const data = node.data;
                if (data.indexOf(marker) >= 0) {
                    const parent = node.parentNode;
                    const strings = data.split(markerRegex);
                    const lastIndex = strings.length - 1;
                    // Generate a new text node for each literal section
                    // These nodes are also used as the markers for node parts
                    for (let i = 0; i < lastIndex; i++) {
                        let insert;
                        let s = strings[i];
                        if (s === '') {
                            insert = createMarker();
                        }
                        else {
                            const match = lastAttributeNameRegex.exec(s);
                            if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                s = s.slice(0, match.index) + match[1] +
                                    match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                            }
                            insert = document.createTextNode(s);
                        }
                        parent.insertBefore(insert, node);
                        this.parts.push({ type: 'node', index: ++index });
                    }
                    // If there's no text, we must insert a comment to mark our place.
                    // Else, we can trust it will stick around after cloning.
                    if (strings[lastIndex] === '') {
                        parent.insertBefore(createMarker(), node);
                        nodesToRemove.push(node);
                    }
                    else {
                        node.data = strings[lastIndex];
                    }
                    // We have a part for each match found
                    partIndex += lastIndex;
                }
            }
            else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                if (node.data === marker) {
                    const parent = node.parentNode;
                    // Add a new marker node to be the startNode of the Part if any of
                    // the following are true:
                    //  * We don't have a previousSibling
                    //  * The previousSibling is already the start of a previous part
                    if (node.previousSibling === null || index === lastPartIndex) {
                        index++;
                        parent.insertBefore(createMarker(), node);
                    }
                    lastPartIndex = index;
                    this.parts.push({ type: 'node', index });
                    // If we don't have a nextSibling, keep this node so we have an end.
                    // Else, we can remove it to save future costs.
                    if (node.nextSibling === null) {
                        node.data = '';
                    }
                    else {
                        nodesToRemove.push(node);
                        index--;
                    }
                    partIndex++;
                }
                else {
                    let i = -1;
                    while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                        // Comment node has a binding marker inside, make an inactive part
                        // The binding won't work, but subsequent bindings will
                        // TODO (justinfagnani): consider whether it's even worth it to
                        // make bindings in comments work
                        this.parts.push({ type: 'node', index: -1 });
                        partIndex++;
                    }
                }
            }
        }
        // Remove text binding nodes after the walk to not disturb the TreeWalker
        for (const n of nodesToRemove) {
            n.parentNode.removeChild(n);
        }
    }
}
const endsWith = (str, suffix) => {
    const index = str.length - suffix.length;
    return index >= 0 && str.slice(index) === suffix;
};
const isTemplatePartActive = (part) => part.index !== -1;
// Allows `document.createComment('')` to be renamed for a
// small manual size-savings.
const createMarker = () => document.createComment('');
/**
 * This regex extracts the attribute name preceding an attribute-position
 * expression. It does this by matching the syntax allowed for attributes
 * against the string literal directly preceding the expression, assuming that
 * the expression is in an attribute-value position.
 *
 * See attributes in the HTML spec:
 * https://www.w3.org/TR/html5/syntax.html#elements-attributes
 *
 * " \x09\x0a\x0c\x0d" are HTML space characters:
 * https://www.w3.org/TR/html5/infrastructure.html#space-characters
 *
 * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
 * space character except " ".
 *
 * So an attribute is:
 *  * The name: any character except a control character, space character, ('),
 *    ("), ">", "=", or "/"
 *  * Followed by zero or more space characters
 *  * Followed by "="
 *  * Followed by zero or more space characters
 *  * Followed by:
 *    * Any character except space, ('), ("), "<", ">", "=", (`), or
 *    * (") then any non-("), or
 *    * (') then any non-(')
 */
const lastAttributeNameRegex = 
// eslint-disable-next-line no-control-regex
/([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
/**
 * Removes the list of nodes from a Template safely. In addition to removing
 * nodes from the Template, the Template part indices are updated to match
 * the mutated Template DOM.
 *
 * As the template is walked the removal state is tracked and
 * part indices are adjusted as needed.
 *
 * div
 *   div#1 (remove) <-- start removing (removing node is div#1)
 *     div
 *       div#2 (remove)  <-- continue removing (removing node is still div#1)
 *         div
 * div <-- stop removing since previous sibling is the removing node (div#1,
 * removed 4 nodes)
 */
function removeNodesFromTemplate(template, nodesToRemove) {
    const { element: { content }, parts } = template;
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let part = parts[partIndex];
    let nodeIndex = -1;
    let removeCount = 0;
    const nodesToRemoveInTemplate = [];
    let currentRemovingNode = null;
    while (walker.nextNode()) {
        nodeIndex++;
        const node = walker.currentNode;
        // End removal if stepped past the removing node
        if (node.previousSibling === currentRemovingNode) {
            currentRemovingNode = null;
        }
        // A node to remove was found in the template
        if (nodesToRemove.has(node)) {
            nodesToRemoveInTemplate.push(node);
            // Track node we're removing
            if (currentRemovingNode === null) {
                currentRemovingNode = node;
            }
        }
        // When removing, increment count by which to adjust subsequent part indices
        if (currentRemovingNode !== null) {
            removeCount++;
        }
        while (part !== undefined && part.index === nodeIndex) {
            // If part is in a removed node deactivate it by setting index to -1 or
            // adjust the index as needed.
            part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
            // go to the next active part.
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            part = parts[partIndex];
        }
    }
    nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
}
const countNodes = (node) => {
    let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
    const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
    while (walker.nextNode()) {
        count++;
    }
    return count;
};
const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
    for (let i = startIndex + 1; i < parts.length; i++) {
        const part = parts[i];
        if (isTemplatePartActive(part)) {
            return i;
        }
    }
    return -1;
};
/**
 * Inserts the given node into the Template, optionally before the given
 * refNode. In addition to inserting the node into the Template, the Template
 * part indices are updated to match the mutated Template DOM.
 */
function insertNodeIntoTemplate(template, node, refNode = null) {
    const { element: { content }, parts } = template;
    // If there's no refNode, then put node at end of template.
    // No part indices need to be shifted in this case.
    if (refNode === null || refNode === undefined) {
        content.appendChild(node);
        return;
    }
    const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
    let partIndex = nextActiveIndexInTemplateParts(parts);
    let insertCount = 0;
    let walkerIndex = -1;
    while (walker.nextNode()) {
        walkerIndex++;
        const walkerNode = walker.currentNode;
        if (walkerNode === refNode) {
            insertCount = countNodes(node);
            refNode.parentNode.insertBefore(node, refNode);
        }
        while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
            // If we've inserted the node, simply adjust all subsequent parts
            if (insertCount > 0) {
                while (partIndex !== -1) {
                    parts[partIndex].index += insertCount;
                    partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                }
                return;
            }
            partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
        }
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const directives = new WeakMap();
const isDirective = (o) => {
    return typeof o === 'function' && directives.has(o);
};

/**
 * @license
 * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * A sentinel value that signals that a value was handled by a directive and
 * should not be written to the DOM.
 */
const noChange = {};
/**
 * A sentinel value that signals a NodePart to fully clear its content.
 */
const nothing = {};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * An instance of a `Template` that can be attached to the DOM and updated
 * with new values.
 */
class TemplateInstance {
    constructor(template, processor, options) {
        this.__parts = [];
        this.template = template;
        this.processor = processor;
        this.options = options;
    }
    update(values) {
        let i = 0;
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.setValue(values[i]);
            }
            i++;
        }
        for (const part of this.__parts) {
            if (part !== undefined) {
                part.commit();
            }
        }
    }
    _clone() {
        // There are a number of steps in the lifecycle of a template instance's
        // DOM fragment:
        //  1. Clone - create the instance fragment
        //  2. Adopt - adopt into the main document
        //  3. Process - find part markers and create parts
        //  4. Upgrade - upgrade custom elements
        //  5. Update - set node, attribute, property, etc., values
        //  6. Connect - connect to the document. Optional and outside of this
        //     method.
        //
        // We have a few constraints on the ordering of these steps:
        //  * We need to upgrade before updating, so that property values will pass
        //    through any property setters.
        //  * We would like to process before upgrading so that we're sure that the
        //    cloned fragment is inert and not disturbed by self-modifying DOM.
        //  * We want custom elements to upgrade even in disconnected fragments.
        //
        // Given these constraints, with full custom elements support we would
        // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
        //
        // But Safari does not implement CustomElementRegistry#upgrade, so we
        // can not implement that order and still have upgrade-before-update and
        // upgrade disconnected fragments. So we instead sacrifice the
        // process-before-upgrade constraint, since in Custom Elements v1 elements
        // must not modify their light DOM in the constructor. We still have issues
        // when co-existing with CEv0 elements like Polymer 1, and with polyfills
        // that don't strictly adhere to the no-modification rule because shadow
        // DOM, which may be created in the constructor, is emulated by being placed
        // in the light DOM.
        //
        // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
        // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
        // in one step.
        //
        // The Custom Elements v1 polyfill supports upgrade(), so the order when
        // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
        // Connect.
        const fragment = isCEPolyfill ?
            this.template.element.content.cloneNode(true) :
            document.importNode(this.template.element.content, true);
        const stack = [];
        const parts = this.template.parts;
        // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
        const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
        let partIndex = 0;
        let nodeIndex = 0;
        let part;
        let node = walker.nextNode();
        // Loop through all the nodes and parts of a template
        while (partIndex < parts.length) {
            part = parts[partIndex];
            if (!isTemplatePartActive(part)) {
                this.__parts.push(undefined);
                partIndex++;
                continue;
            }
            // Progress the tree walker until we find our next part's node.
            // Note that multiple parts may share the same node (attribute parts
            // on a single element), so this loop may not run at all.
            while (nodeIndex < part.index) {
                nodeIndex++;
                if (node.nodeName === 'TEMPLATE') {
                    stack.push(node);
                    walker.currentNode = node.content;
                }
                if ((node = walker.nextNode()) === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    node = walker.nextNode();
                }
            }
            // We've arrived at our part's node.
            if (part.type === 'node') {
                const part = this.processor.handleTextExpression(this.options);
                part.insertAfterNode(node.previousSibling);
                this.__parts.push(part);
            }
            else {
                this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
            }
            partIndex++;
        }
        if (isCEPolyfill) {
            document.adoptNode(fragment);
            customElements.upgrade(fragment);
        }
        return fragment;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const commentMarker = ` ${marker} `;
/**
 * The return type of `html`, which holds a Template and the values from
 * interpolated expressions.
 */
class TemplateResult {
    constructor(strings, values, type, processor) {
        this.strings = strings;
        this.values = values;
        this.type = type;
        this.processor = processor;
    }
    /**
     * Returns a string of HTML used to create a `<template>` element.
     */
    getHTML() {
        const l = this.strings.length - 1;
        let html = '';
        let isCommentBinding = false;
        for (let i = 0; i < l; i++) {
            const s = this.strings[i];
            // For each binding we want to determine the kind of marker to insert
            // into the template source before it's parsed by the browser's HTML
            // parser. The marker type is based on whether the expression is in an
            // attribute, text, or comment position.
            //   * For node-position bindings we insert a comment with the marker
            //     sentinel as its text content, like <!--{{lit-guid}}-->.
            //   * For attribute bindings we insert just the marker sentinel for the
            //     first binding, so that we support unquoted attribute bindings.
            //     Subsequent bindings can use a comment marker because multi-binding
            //     attributes must be quoted.
            //   * For comment bindings we insert just the marker sentinel so we don't
            //     close the comment.
            //
            // The following code scans the template source, but is *not* an HTML
            // parser. We don't need to track the tree structure of the HTML, only
            // whether a binding is inside a comment, and if not, if it appears to be
            // the first binding in an attribute.
            const commentOpen = s.lastIndexOf('<!--');
            // We're in comment position if we have a comment open with no following
            // comment close. Because <-- can appear in an attribute value there can
            // be false positives.
            isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                s.indexOf('-->', commentOpen + 1) === -1;
            // Check to see if we have an attribute-like sequence preceding the
            // expression. This can match "name=value" like structures in text,
            // comments, and attribute values, so there can be false-positives.
            const attributeMatch = lastAttributeNameRegex.exec(s);
            if (attributeMatch === null) {
                // We're only in this branch if we don't have a attribute-like
                // preceding sequence. For comments, this guards against unusual
                // attribute values like <div foo="<!--${'bar'}">. Cases like
                // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                // below.
                html += s + (isCommentBinding ? commentMarker : nodeMarker);
            }
            else {
                // For attributes we use just a marker sentinel, and also append a
                // $lit$ suffix to the name to opt-out of attribute-specific parsing
                // that IE and Edge do for style and certain SVG attributes.
                html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                    attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                    marker;
            }
        }
        html += this.strings[l];
        return html;
    }
    getTemplateElement() {
        const template = document.createElement('template');
        template.innerHTML = this.getHTML();
        return template;
    }
}

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const isPrimitive = (value) => {
    return (value === null ||
        !(typeof value === 'object' || typeof value === 'function'));
};
const isIterable = (value) => {
    return Array.isArray(value) ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !!(value && value[Symbol.iterator]);
};
/**
 * Writes attribute values to the DOM for a group of AttributeParts bound to a
 * single attribute. The value is only set once even if there are multiple parts
 * for an attribute.
 */
class AttributeCommitter {
    constructor(element, name, strings) {
        this.dirty = true;
        this.element = element;
        this.name = name;
        this.strings = strings;
        this.parts = [];
        for (let i = 0; i < strings.length - 1; i++) {
            this.parts[i] = this._createPart();
        }
    }
    /**
     * Creates a single part. Override this to create a differnt type of part.
     */
    _createPart() {
        return new AttributePart(this);
    }
    _getValue() {
        const strings = this.strings;
        const l = strings.length - 1;
        let text = '';
        for (let i = 0; i < l; i++) {
            text += strings[i];
            const part = this.parts[i];
            if (part !== undefined) {
                const v = part.value;
                if (isPrimitive(v) || !isIterable(v)) {
                    text += typeof v === 'string' ? v : String(v);
                }
                else {
                    for (const t of v) {
                        text += typeof t === 'string' ? t : String(t);
                    }
                }
            }
        }
        text += strings[l];
        return text;
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            this.element.setAttribute(this.name, this._getValue());
        }
    }
}
/**
 * A Part that controls all or part of an attribute value.
 */
class AttributePart {
    constructor(committer) {
        this.value = undefined;
        this.committer = committer;
    }
    setValue(value) {
        if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
            this.value = value;
            // If the value is a not a directive, dirty the committer so that it'll
            // call setAttribute. If the value is a directive, it'll dirty the
            // committer if it calls setValue().
            if (!isDirective(value)) {
                this.committer.dirty = true;
            }
        }
    }
    commit() {
        while (isDirective(this.value)) {
            const directive = this.value;
            this.value = noChange;
            directive(this);
        }
        if (this.value === noChange) {
            return;
        }
        this.committer.commit();
    }
}
/**
 * A Part that controls a location within a Node tree. Like a Range, NodePart
 * has start and end locations and can set and update the Nodes between those
 * locations.
 *
 * NodeParts support several value types: primitives, Nodes, TemplateResults,
 * as well as arrays and iterables of those types.
 */
class NodePart {
    constructor(options) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.options = options;
    }
    /**
     * Appends this part into a container.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendInto(container) {
        this.startNode = container.appendChild(createMarker());
        this.endNode = container.appendChild(createMarker());
    }
    /**
     * Inserts this part after the `ref` node (between `ref` and `ref`'s next
     * sibling). Both `ref` and its next sibling must be static, unchanging nodes
     * such as those that appear in a literal section of a template.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterNode(ref) {
        this.startNode = ref;
        this.endNode = ref.nextSibling;
    }
    /**
     * Appends this part into a parent part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    appendIntoPart(part) {
        part.__insert(this.startNode = createMarker());
        part.__insert(this.endNode = createMarker());
    }
    /**
     * Inserts this part after the `ref` part.
     *
     * This part must be empty, as its contents are not automatically moved.
     */
    insertAfterPart(ref) {
        ref.__insert(this.startNode = createMarker());
        this.endNode = ref.endNode;
        ref.endNode = this.startNode;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        if (this.startNode.parentNode === null) {
            return;
        }
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        const value = this.__pendingValue;
        if (value === noChange) {
            return;
        }
        if (isPrimitive(value)) {
            if (value !== this.value) {
                this.__commitText(value);
            }
        }
        else if (value instanceof TemplateResult) {
            this.__commitTemplateResult(value);
        }
        else if (value instanceof Node) {
            this.__commitNode(value);
        }
        else if (isIterable(value)) {
            this.__commitIterable(value);
        }
        else if (value === nothing) {
            this.value = nothing;
            this.clear();
        }
        else {
            // Fallback, will render the string representation
            this.__commitText(value);
        }
    }
    __insert(node) {
        this.endNode.parentNode.insertBefore(node, this.endNode);
    }
    __commitNode(value) {
        if (this.value === value) {
            return;
        }
        this.clear();
        this.__insert(value);
        this.value = value;
    }
    __commitText(value) {
        const node = this.startNode.nextSibling;
        value = value == null ? '' : value;
        // If `value` isn't already a string, we explicitly convert it here in case
        // it can't be implicitly converted - i.e. it's a symbol.
        const valueAsString = typeof value === 'string' ? value : String(value);
        if (node === this.endNode.previousSibling &&
            node.nodeType === 3 /* Node.TEXT_NODE */) {
            // If we only have a single text node between the markers, we can just
            // set its value, rather than replacing it.
            // TODO(justinfagnani): Can we just check if this.value is primitive?
            node.data = valueAsString;
        }
        else {
            this.__commitNode(document.createTextNode(valueAsString));
        }
        this.value = value;
    }
    __commitTemplateResult(value) {
        const template = this.options.templateFactory(value);
        if (this.value instanceof TemplateInstance &&
            this.value.template === template) {
            this.value.update(value.values);
        }
        else {
            // Make sure we propagate the template processor from the TemplateResult
            // so that we use its syntax extension, etc. The template factory comes
            // from the render function options so that it can control template
            // caching and preprocessing.
            const instance = new TemplateInstance(template, value.processor, this.options);
            const fragment = instance._clone();
            instance.update(value.values);
            this.__commitNode(fragment);
            this.value = instance;
        }
    }
    __commitIterable(value) {
        // For an Iterable, we create a new InstancePart per item, then set its
        // value to the item. This is a little bit of overhead for every item in
        // an Iterable, but it lets us recurse easily and efficiently update Arrays
        // of TemplateResults that will be commonly returned from expressions like:
        // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
        // If _value is an array, then the previous render was of an
        // iterable and _value will contain the NodeParts from the previous
        // render. If _value is not an array, clear this part and make a new
        // array for NodeParts.
        if (!Array.isArray(this.value)) {
            this.value = [];
            this.clear();
        }
        // Lets us keep track of how many items we stamped so we can clear leftover
        // items from a previous render
        const itemParts = this.value;
        let partIndex = 0;
        let itemPart;
        for (const item of value) {
            // Try to reuse an existing part
            itemPart = itemParts[partIndex];
            // If no existing part, create a new one
            if (itemPart === undefined) {
                itemPart = new NodePart(this.options);
                itemParts.push(itemPart);
                if (partIndex === 0) {
                    itemPart.appendIntoPart(this);
                }
                else {
                    itemPart.insertAfterPart(itemParts[partIndex - 1]);
                }
            }
            itemPart.setValue(item);
            itemPart.commit();
            partIndex++;
        }
        if (partIndex < itemParts.length) {
            // Truncate the parts array so _value reflects the current state
            itemParts.length = partIndex;
            this.clear(itemPart && itemPart.endNode);
        }
    }
    clear(startNode = this.startNode) {
        removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
    }
}
/**
 * Implements a boolean attribute, roughly as defined in the HTML
 * specification.
 *
 * If the value is truthy, then the attribute is present with a value of
 * ''. If the value is falsey, the attribute is removed.
 */
class BooleanAttributePart {
    constructor(element, name, strings) {
        this.value = undefined;
        this.__pendingValue = undefined;
        if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
            throw new Error('Boolean attributes can only contain a single expression');
        }
        this.element = element;
        this.name = name;
        this.strings = strings;
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const value = !!this.__pendingValue;
        if (this.value !== value) {
            if (value) {
                this.element.setAttribute(this.name, '');
            }
            else {
                this.element.removeAttribute(this.name);
            }
            this.value = value;
        }
        this.__pendingValue = noChange;
    }
}
/**
 * Sets attribute values for PropertyParts, so that the value is only set once
 * even if there are multiple parts for a property.
 *
 * If an expression controls the whole property value, then the value is simply
 * assigned to the property under control. If there are string literals or
 * multiple expressions, then the strings are expressions are interpolated into
 * a string first.
 */
class PropertyCommitter extends AttributeCommitter {
    constructor(element, name, strings) {
        super(element, name, strings);
        this.single =
            (strings.length === 2 && strings[0] === '' && strings[1] === '');
    }
    _createPart() {
        return new PropertyPart(this);
    }
    _getValue() {
        if (this.single) {
            return this.parts[0].value;
        }
        return super._getValue();
    }
    commit() {
        if (this.dirty) {
            this.dirty = false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            this.element[this.name] = this._getValue();
        }
    }
}
class PropertyPart extends AttributePart {
}
// Detect event listener options support. If the `capture` property is read
// from the options object, then options are supported. If not, then the third
// argument to add/removeEventListener is interpreted as the boolean capture
// value so we should only pass the `capture` property.
let eventOptionsSupported = false;
// Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
// blocks right into the body of a module
(() => {
    try {
        const options = {
            get capture() {
                eventOptionsSupported = true;
                return false;
            }
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.addEventListener('test', options, options);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.removeEventListener('test', options, options);
    }
    catch (_e) {
        // event options not supported
    }
})();
class EventPart {
    constructor(element, eventName, eventContext) {
        this.value = undefined;
        this.__pendingValue = undefined;
        this.element = element;
        this.eventName = eventName;
        this.eventContext = eventContext;
        this.__boundHandleEvent = (e) => this.handleEvent(e);
    }
    setValue(value) {
        this.__pendingValue = value;
    }
    commit() {
        while (isDirective(this.__pendingValue)) {
            const directive = this.__pendingValue;
            this.__pendingValue = noChange;
            directive(this);
        }
        if (this.__pendingValue === noChange) {
            return;
        }
        const newListener = this.__pendingValue;
        const oldListener = this.value;
        const shouldRemoveListener = newListener == null ||
            oldListener != null &&
                (newListener.capture !== oldListener.capture ||
                    newListener.once !== oldListener.once ||
                    newListener.passive !== oldListener.passive);
        const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
        if (shouldRemoveListener) {
            this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        if (shouldAddListener) {
            this.__options = getOptions(newListener);
            this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
        }
        this.value = newListener;
        this.__pendingValue = noChange;
    }
    handleEvent(event) {
        if (typeof this.value === 'function') {
            this.value.call(this.eventContext || this.element, event);
        }
        else {
            this.value.handleEvent(event);
        }
    }
}
// We copy options because of the inconsistent behavior of browsers when reading
// the third argument of add/removeEventListener. IE11 doesn't support options
// at all. Chrome 41 only reads `capture` if the argument is an object.
const getOptions = (o) => o &&
    (eventOptionsSupported ?
        { capture: o.capture, passive: o.passive, once: o.once } :
        o.capture);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * The default TemplateFactory which caches Templates keyed on
 * result.type and result.strings.
 */
function templateFactory(result) {
    let templateCache = templateCaches.get(result.type);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches.set(result.type, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    // If the TemplateStringsArray is new, generate a key from the strings
    // This key is shared between all templates with identical content
    const key = result.strings.join(marker);
    // Check if we already have a Template for this key
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        // If we have not seen this key before, create a new Template
        template = new Template(result, result.getTemplateElement());
        // Cache the Template for this key
        templateCache.keyString.set(key, template);
    }
    // Cache all future queries for this TemplateStringsArray
    templateCache.stringsArray.set(result.strings, template);
    return template;
}
const templateCaches = new Map();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
const parts = new WeakMap();
/**
 * Renders a template result or other value to a container.
 *
 * To update a container with new values, reevaluate the template literal and
 * call `render` with the new result.
 *
 * @param result Any value renderable by NodePart - typically a TemplateResult
 *     created by evaluating a template tag like `html` or `svg`.
 * @param container A DOM parent to render to. The entire contents are either
 *     replaced, or efficiently updated if the same result type was previous
 *     rendered there.
 * @param options RenderOptions for the entire render tree rendered to this
 *     container. Render options must *not* change between renders to the same
 *     container, as those changes will not effect previously rendered DOM.
 */
const render = (result, container, options) => {
    let part = parts.get(container);
    if (part === undefined) {
        removeNodes(container, container.firstChild);
        parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
        part.appendInto(container);
    }
    part.setValue(result);
    part.commit();
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
/**
 * Creates Parts when a template is instantiated.
 */
class DefaultTemplateProcessor {
    /**
     * Create parts for an attribute-position binding, given the event, attribute
     * name, and string literals.
     *
     * @param element The element containing the binding
     * @param name  The attribute name
     * @param strings The string literals. There are always at least two strings,
     *   event for fully-controlled bindings with a single expression.
     */
    handleAttributeExpressions(element, name, strings, options) {
        const prefix = name[0];
        if (prefix === '.') {
            const committer = new PropertyCommitter(element, name.slice(1), strings);
            return committer.parts;
        }
        if (prefix === '@') {
            return [new EventPart(element, name.slice(1), options.eventContext)];
        }
        if (prefix === '?') {
            return [new BooleanAttributePart(element, name.slice(1), strings)];
        }
        const committer = new AttributeCommitter(element, name, strings);
        return committer.parts;
    }
    /**
     * Create parts for a text-position binding.
     * @param templateFactory
     */
    handleTextExpression(options) {
        return new NodePart(options);
    }
}
const defaultTemplateProcessor = new DefaultTemplateProcessor();

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for lit-html usage.
// TODO(justinfagnani): inject version number at build time
if (typeof window !== 'undefined') {
    (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.2.1');
}
/**
 * Interprets a template literal as an HTML template that can efficiently
 * render to and update a container.
 */
const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// Get a key to lookup in `templateCaches`.
const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
let compatibleShadyCSSVersion = true;
if (typeof window.ShadyCSS === 'undefined') {
    compatibleShadyCSSVersion = false;
}
else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
    console.warn(`Incompatible ShadyCSS version detected. ` +
        `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and ` +
        `@webcomponents/shadycss@1.3.1.`);
    compatibleShadyCSSVersion = false;
}
/**
 * Template factory which scopes template DOM using ShadyCSS.
 * @param scopeName {string}
 */
const shadyTemplateFactory = (scopeName) => (result) => {
    const cacheKey = getTemplateCacheKey(result.type, scopeName);
    let templateCache = templateCaches.get(cacheKey);
    if (templateCache === undefined) {
        templateCache = {
            stringsArray: new WeakMap(),
            keyString: new Map()
        };
        templateCaches.set(cacheKey, templateCache);
    }
    let template = templateCache.stringsArray.get(result.strings);
    if (template !== undefined) {
        return template;
    }
    const key = result.strings.join(marker);
    template = templateCache.keyString.get(key);
    if (template === undefined) {
        const element = result.getTemplateElement();
        if (compatibleShadyCSSVersion) {
            window.ShadyCSS.prepareTemplateDom(element, scopeName);
        }
        template = new Template(result, element);
        templateCache.keyString.set(key, template);
    }
    templateCache.stringsArray.set(result.strings, template);
    return template;
};
const TEMPLATE_TYPES = ['html', 'svg'];
/**
 * Removes all style elements from Templates for the given scopeName.
 */
const removeStylesFromLitTemplates = (scopeName) => {
    TEMPLATE_TYPES.forEach((type) => {
        const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
        if (templates !== undefined) {
            templates.keyString.forEach((template) => {
                const { element: { content } } = template;
                // IE 11 doesn't support the iterable param Set constructor
                const styles = new Set();
                Array.from(content.querySelectorAll('style')).forEach((s) => {
                    styles.add(s);
                });
                removeNodesFromTemplate(template, styles);
            });
        }
    });
};
const shadyRenderSet = new Set();
/**
 * For the given scope name, ensures that ShadyCSS style scoping is performed.
 * This is done just once per scope name so the fragment and template cannot
 * be modified.
 * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
 * to be scoped and appended to the document
 * (2) removes style elements from all lit-html Templates for this scope name.
 *
 * Note, <style> elements can only be placed into templates for the
 * initial rendering of the scope. If <style> elements are included in templates
 * dynamically rendered to the scope (after the first scope render), they will
 * not be scoped and the <style> will be left in the template and rendered
 * output.
 */
const prepareTemplateStyles = (scopeName, renderedDOM, template) => {
    shadyRenderSet.add(scopeName);
    // If `renderedDOM` is stamped from a Template, then we need to edit that
    // Template's underlying template element. Otherwise, we create one here
    // to give to ShadyCSS, which still requires one while scoping.
    const templateElement = !!template ? template.element : document.createElement('template');
    // Move styles out of rendered DOM and store.
    const styles = renderedDOM.querySelectorAll('style');
    const { length } = styles;
    // If there are no styles, skip unnecessary work
    if (length === 0) {
        // Ensure prepareTemplateStyles is called to support adding
        // styles via `prepareAdoptedCssText` since that requires that
        // `prepareTemplateStyles` is called.
        //
        // ShadyCSS will only update styles containing @apply in the template
        // given to `prepareTemplateStyles`. If no lit Template was given,
        // ShadyCSS will not be able to update uses of @apply in any relevant
        // template. However, this is not a problem because we only create the
        // template for the purpose of supporting `prepareAdoptedCssText`,
        // which doesn't support @apply at all.
        window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
        return;
    }
    const condensedStyle = document.createElement('style');
    // Collect styles into a single style. This helps us make sure ShadyCSS
    // manipulations will not prevent us from being able to fix up template
    // part indices.
    // NOTE: collecting styles is inefficient for browsers but ShadyCSS
    // currently does this anyway. When it does not, this should be changed.
    for (let i = 0; i < length; i++) {
        const style = styles[i];
        style.parentNode.removeChild(style);
        condensedStyle.textContent += style.textContent;
    }
    // Remove styles from nested templates in this scope.
    removeStylesFromLitTemplates(scopeName);
    // And then put the condensed style into the "root" template passed in as
    // `template`.
    const content = templateElement.content;
    if (!!template) {
        insertNodeIntoTemplate(template, condensedStyle, content.firstChild);
    }
    else {
        content.insertBefore(condensedStyle, content.firstChild);
    }
    // Note, it's important that ShadyCSS gets the template that `lit-html`
    // will actually render so that it can update the style inside when
    // needed (e.g. @apply native Shadow DOM case).
    window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
    const style = content.querySelector('style');
    if (window.ShadyCSS.nativeShadow && style !== null) {
        // When in native Shadow DOM, ensure the style created by ShadyCSS is
        // included in initially rendered output (`renderedDOM`).
        renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
    }
    else if (!!template) {
        // When no style is left in the template, parts will be broken as a
        // result. To fix this, we put back the style node ShadyCSS removed
        // and then tell lit to remove that node from the template.
        // There can be no style in the template in 2 cases (1) when Shady DOM
        // is in use, ShadyCSS removes all styles, (2) when native Shadow DOM
        // is in use ShadyCSS removes the style if it contains no content.
        // NOTE, ShadyCSS creates its own style so we can safely add/remove
        // `condensedStyle` here.
        content.insertBefore(condensedStyle, content.firstChild);
        const removes = new Set();
        removes.add(condensedStyle);
        removeNodesFromTemplate(template, removes);
    }
};
/**
 * Extension to the standard `render` method which supports rendering
 * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
 * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
 * or when the webcomponentsjs
 * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
 *
 * Adds a `scopeName` option which is used to scope element DOM and stylesheets
 * when native ShadowDOM is unavailable. The `scopeName` will be added to
 * the class attribute of all rendered DOM. In addition, any style elements will
 * be automatically re-written with this `scopeName` selector and moved out
 * of the rendered DOM and into the document `<head>`.
 *
 * It is common to use this render method in conjunction with a custom element
 * which renders a shadowRoot. When this is done, typically the element's
 * `localName` should be used as the `scopeName`.
 *
 * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
 * custom properties (needed only on older browsers like IE11) and a shim for
 * a deprecated feature called `@apply` that supports applying a set of css
 * custom properties to a given location.
 *
 * Usage considerations:
 *
 * * Part values in `<style>` elements are only applied the first time a given
 * `scopeName` renders. Subsequent changes to parts in style elements will have
 * no effect. Because of this, parts in style elements should only be used for
 * values that will never change, for example parts that set scope-wide theme
 * values or parts which render shared style elements.
 *
 * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
 * custom element's `constructor` is not supported. Instead rendering should
 * either done asynchronously, for example at microtask timing (for example
 * `Promise.resolve()`), or be deferred until the first time the element's
 * `connectedCallback` runs.
 *
 * Usage considerations when using shimmed custom properties or `@apply`:
 *
 * * Whenever any dynamic changes are made which affect
 * css custom properties, `ShadyCSS.styleElement(element)` must be called
 * to update the element. There are two cases when this is needed:
 * (1) the element is connected to a new parent, (2) a class is added to the
 * element that causes it to match different custom properties.
 * To address the first case when rendering a custom element, `styleElement`
 * should be called in the element's `connectedCallback`.
 *
 * * Shimmed custom properties may only be defined either for an entire
 * shadowRoot (for example, in a `:host` rule) or via a rule that directly
 * matches an element with a shadowRoot. In other words, instead of flowing from
 * parent to child as do native css custom properties, shimmed custom properties
 * flow only from shadowRoots to nested shadowRoots.
 *
 * * When using `@apply` mixing css shorthand property names with
 * non-shorthand names (for example `border` and `border-width`) is not
 * supported.
 */
const render$1 = (result, container, options) => {
    if (!options || typeof options !== 'object' || !options.scopeName) {
        throw new Error('The `scopeName` option is required.');
    }
    const scopeName = options.scopeName;
    const hasRendered = parts.has(container);
    const needsScoping = compatibleShadyCSSVersion &&
        container.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
        !!container.host;
    // Handle first render to a scope specially...
    const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
    // On first scope render, render into a fragment; this cannot be a single
    // fragment that is reused since nested renders can occur synchronously.
    const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
    render(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory(scopeName) }, options));
    // When performing first scope render,
    // (1) We've rendered into a fragment so that there's a chance to
    // `prepareTemplateStyles` before sub-elements hit the DOM
    // (which might cause them to render based on a common pattern of
    // rendering in a custom element's `connectedCallback`);
    // (2) Scope the template with ShadyCSS one time only for this scope.
    // (3) Render the fragment into the container and make sure the
    // container knows its `part` is the one we just rendered. This ensures
    // DOM will be re-used on subsequent renders.
    if (firstScopeRender) {
        const part = parts.get(renderContainer);
        parts.delete(renderContainer);
        // ShadyCSS might have style sheets (e.g. from `prepareAdoptedCssText`)
        // that should apply to `renderContainer` even if the rendered value is
        // not a TemplateInstance. However, it will only insert scoped styles
        // into the document if `prepareTemplateStyles` has already been called
        // for the given scope name.
        const template = part.value instanceof TemplateInstance ?
            part.value.template :
            undefined;
        prepareTemplateStyles(scopeName, renderContainer, template);
        removeNodes(container, container.firstChild);
        container.appendChild(renderContainer);
        parts.set(container, part);
    }
    // After elements have hit the DOM, update styling if this is the
    // initial render to this container.
    // This is needed whenever dynamic changes are made so it would be
    // safest to do every render; however, this would regress performance
    // so we leave it up to the user to call `ShadyCSS.styleElement`
    // for dynamic changes.
    if (!hasRendered && needsScoping) {
        window.ShadyCSS.styleElement(container.host);
    }
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
var _a;
/**
 * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
 * replaced at compile time by the munged name for object[property]. We cannot
 * alias this function, so we have to use a small shim that has the same
 * behavior when not compiling.
 */
window.JSCompiler_renameProperty =
    (prop, _obj) => prop;
const defaultConverter = {
    toAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value ? '' : null;
            case Object:
            case Array:
                // if the value is `null` or `undefined` pass this through
                // to allow removing/no change behavior.
                return value == null ? value : JSON.stringify(value);
        }
        return value;
    },
    fromAttribute(value, type) {
        switch (type) {
            case Boolean:
                return value !== null;
            case Number:
                return value === null ? null : Number(value);
            case Object:
            case Array:
                return JSON.parse(value);
        }
        return value;
    }
};
/**
 * Change function that returns true if `value` is different from `oldValue`.
 * This method is used as the default for a property's `hasChanged` function.
 */
const notEqual = (value, old) => {
    // This ensures (old==NaN, value==NaN) always returns false
    return old !== value && (old === old || value === value);
};
const defaultPropertyDeclaration = {
    attribute: true,
    type: String,
    converter: defaultConverter,
    reflect: false,
    hasChanged: notEqual
};
const STATE_HAS_UPDATED = 1;
const STATE_UPDATE_REQUESTED = 1 << 2;
const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
/**
 * The Closure JS Compiler doesn't currently have good support for static
 * property semantics where "this" is dynamic (e.g.
 * https://github.com/google/closure-compiler/issues/3177 and others) so we use
 * this hack to bypass any rewriting by the compiler.
 */
const finalized = 'finalized';
/**
 * Base element class which manages element properties and attributes. When
 * properties change, the `update` method is asynchronously called. This method
 * should be supplied by subclassers to render updates as desired.
 */
class UpdatingElement extends HTMLElement {
    constructor() {
        super();
        this._updateState = 0;
        this._instanceProperties = undefined;
        // Initialize to an unresolved Promise so we can make sure the element has
        // connected before first update.
        this._updatePromise = new Promise((res) => this._enableUpdatingResolver = res);
        /**
         * Map with keys for any properties that have changed since the last
         * update cycle with previous values.
         */
        this._changedProperties = new Map();
        /**
         * Map with keys of properties that should be reflected when updated.
         */
        this._reflectingProperties = undefined;
        this.initialize();
    }
    /**
     * Returns a list of attributes corresponding to the registered properties.
     * @nocollapse
     */
    static get observedAttributes() {
        // note: piggy backing on this to ensure we're finalized.
        this.finalize();
        const attributes = [];
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this._classProperties.forEach((v, p) => {
            const attr = this._attributeNameForProperty(p, v);
            if (attr !== undefined) {
                this._attributeToPropertyMap.set(attr, p);
                attributes.push(attr);
            }
        });
        return attributes;
    }
    /**
     * Ensures the private `_classProperties` property metadata is created.
     * In addition to `finalize` this is also called in `createProperty` to
     * ensure the `@property` decorator can add property metadata.
     */
    /** @nocollapse */
    static _ensureClassProperties() {
        // ensure private storage for property declarations.
        if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
            this._classProperties = new Map();
            // NOTE: Workaround IE11 not supporting Map constructor argument.
            const superProperties = Object.getPrototypeOf(this)._classProperties;
            if (superProperties !== undefined) {
                superProperties.forEach((v, k) => this._classProperties.set(k, v));
            }
        }
    }
    /**
     * Creates a property accessor on the element prototype if one does not exist
     * and stores a PropertyDeclaration for the property with the given options.
     * The property setter calls the property's `hasChanged` property option
     * or uses a strict identity check to determine whether or not to request
     * an update.
     *
     * This method may be overridden to customize properties; however,
     * when doing so, it's important to call `super.createProperty` to ensure
     * the property is setup correctly. This method calls
     * `getPropertyDescriptor` internally to get a descriptor to install.
     * To customize what properties do when they are get or set, override
     * `getPropertyDescriptor`. To customize the options for a property,
     * implement `createProperty` like this:
     *
     * static createProperty(name, options) {
     *   options = Object.assign(options, {myOption: true});
     *   super.createProperty(name, options);
     * }
     *
     * @nocollapse
     */
    static createProperty(name, options = defaultPropertyDeclaration) {
        // Note, since this can be called by the `@property` decorator which
        // is called before `finalize`, we ensure storage exists for property
        // metadata.
        this._ensureClassProperties();
        this._classProperties.set(name, options);
        // Do not generate an accessor if the prototype already has one, since
        // it would be lost otherwise and that would never be the user's intention;
        // Instead, we expect users to call `requestUpdate` themselves from
        // user-defined accessors. Note that if the super has an accessor we will
        // still overwrite it
        if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
            return;
        }
        const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
        const descriptor = this.getPropertyDescriptor(name, key, options);
        if (descriptor !== undefined) {
            Object.defineProperty(this.prototype, name, descriptor);
        }
    }
    /**
     * Returns a property descriptor to be defined on the given named property.
     * If no descriptor is returned, the property will not become an accessor.
     * For example,
     *
     *   class MyElement extends LitElement {
     *     static getPropertyDescriptor(name, key, options) {
     *       const defaultDescriptor =
     *           super.getPropertyDescriptor(name, key, options);
     *       const setter = defaultDescriptor.set;
     *       return {
     *         get: defaultDescriptor.get,
     *         set(value) {
     *           setter.call(this, value);
     *           // custom action.
     *         },
     *         configurable: true,
     *         enumerable: true
     *       }
     *     }
     *   }
     *
     * @nocollapse
     */
    static getPropertyDescriptor(name, key, _options) {
        return {
            // tslint:disable-next-line:no-any no symbol in index
            get() {
                return this[key];
            },
            set(value) {
                const oldValue = this[name];
                this[key] = value;
                this._requestUpdate(name, oldValue);
            },
            configurable: true,
            enumerable: true
        };
    }
    /**
     * Returns the property options associated with the given property.
     * These options are defined with a PropertyDeclaration via the `properties`
     * object or the `@property` decorator and are registered in
     * `createProperty(...)`.
     *
     * Note, this method should be considered "final" and not overridden. To
     * customize the options for a given property, override `createProperty`.
     *
     * @nocollapse
     * @final
     */
    static getPropertyOptions(name) {
        return this._classProperties && this._classProperties.get(name) ||
            defaultPropertyDeclaration;
    }
    /**
     * Creates property accessors for registered properties and ensures
     * any superclasses are also finalized.
     * @nocollapse
     */
    static finalize() {
        // finalize any superclasses
        const superCtor = Object.getPrototypeOf(this);
        if (!superCtor.hasOwnProperty(finalized)) {
            superCtor.finalize();
        }
        this[finalized] = true;
        this._ensureClassProperties();
        // initialize Map populated in observedAttributes
        this._attributeToPropertyMap = new Map();
        // make any properties
        // Note, only process "own" properties since this element will inherit
        // any properties defined on the superClass, and finalization ensures
        // the entire prototype chain is finalized.
        if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
            const props = this.properties;
            // support symbols in properties (IE11 does not support this)
            const propKeys = [
                ...Object.getOwnPropertyNames(props),
                ...(typeof Object.getOwnPropertySymbols === 'function') ?
                    Object.getOwnPropertySymbols(props) :
                    []
            ];
            // This for/of is ok because propKeys is an array
            for (const p of propKeys) {
                // note, use of `any` is due to TypeSript lack of support for symbol in
                // index types
                // tslint:disable-next-line:no-any no symbol in index
                this.createProperty(p, props[p]);
            }
        }
    }
    /**
     * Returns the property name for the given attribute `name`.
     * @nocollapse
     */
    static _attributeNameForProperty(name, options) {
        const attribute = options.attribute;
        return attribute === false ?
            undefined :
            (typeof attribute === 'string' ?
                attribute :
                (typeof name === 'string' ? name.toLowerCase() : undefined));
    }
    /**
     * Returns true if a property should request an update.
     * Called when a property value is set and uses the `hasChanged`
     * option for the property if present or a strict identity check.
     * @nocollapse
     */
    static _valueHasChanged(value, old, hasChanged = notEqual) {
        return hasChanged(value, old);
    }
    /**
     * Returns the property value for the given attribute value.
     * Called via the `attributeChangedCallback` and uses the property's
     * `converter` or `converter.fromAttribute` property option.
     * @nocollapse
     */
    static _propertyValueFromAttribute(value, options) {
        const type = options.type;
        const converter = options.converter || defaultConverter;
        const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
        return fromAttribute ? fromAttribute(value, type) : value;
    }
    /**
     * Returns the attribute value for the given property value. If this
     * returns undefined, the property will *not* be reflected to an attribute.
     * If this returns null, the attribute will be removed, otherwise the
     * attribute will be set to the value.
     * This uses the property's `reflect` and `type.toAttribute` property options.
     * @nocollapse
     */
    static _propertyValueToAttribute(value, options) {
        if (options.reflect === undefined) {
            return;
        }
        const type = options.type;
        const converter = options.converter;
        const toAttribute = converter && converter.toAttribute ||
            defaultConverter.toAttribute;
        return toAttribute(value, type);
    }
    /**
     * Performs element initialization. By default captures any pre-set values for
     * registered properties.
     */
    initialize() {
        this._saveInstanceProperties();
        // ensures first update will be caught by an early access of
        // `updateComplete`
        this._requestUpdate();
    }
    /**
     * Fixes any properties set on the instance before upgrade time.
     * Otherwise these would shadow the accessor and break these properties.
     * The properties are stored in a Map which is played back after the
     * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
     * (<=41), properties created for native platform properties like (`id` or
     * `name`) may not have default values set in the element constructor. On
     * these browsers native properties appear on instances and therefore their
     * default value will overwrite any element default (e.g. if the element sets
     * this.id = 'id' in the constructor, the 'id' will become '' since this is
     * the native platform default).
     */
    _saveInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        this.constructor
            ._classProperties.forEach((_v, p) => {
            if (this.hasOwnProperty(p)) {
                const value = this[p];
                delete this[p];
                if (!this._instanceProperties) {
                    this._instanceProperties = new Map();
                }
                this._instanceProperties.set(p, value);
            }
        });
    }
    /**
     * Applies previously saved instance properties.
     */
    _applyInstanceProperties() {
        // Use forEach so this works even if for/of loops are compiled to for loops
        // expecting arrays
        // tslint:disable-next-line:no-any
        this._instanceProperties.forEach((v, p) => this[p] = v);
        this._instanceProperties = undefined;
    }
    connectedCallback() {
        // Ensure first connection completes an update. Updates cannot complete
        // before connection.
        this.enableUpdating();
    }
    enableUpdating() {
        if (this._enableUpdatingResolver !== undefined) {
            this._enableUpdatingResolver();
            this._enableUpdatingResolver = undefined;
        }
    }
    /**
     * Allows for `super.disconnectedCallback()` in extensions while
     * reserving the possibility of making non-breaking feature additions
     * when disconnecting at some point in the future.
     */
    disconnectedCallback() {
    }
    /**
     * Synchronizes property values when attributes change.
     */
    attributeChangedCallback(name, old, value) {
        if (old !== value) {
            this._attributeToProperty(name, value);
        }
    }
    _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
        const ctor = this.constructor;
        const attr = ctor._attributeNameForProperty(name, options);
        if (attr !== undefined) {
            const attrValue = ctor._propertyValueToAttribute(value, options);
            // an undefined value does not change the attribute.
            if (attrValue === undefined) {
                return;
            }
            // Track if the property is being reflected to avoid
            // setting the property again via `attributeChangedCallback`. Note:
            // 1. this takes advantage of the fact that the callback is synchronous.
            // 2. will behave incorrectly if multiple attributes are in the reaction
            // stack at time of calling. However, since we process attributes
            // in `update` this should not be possible (or an extreme corner case
            // that we'd like to discover).
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
            if (attrValue == null) {
                this.removeAttribute(attr);
            }
            else {
                this.setAttribute(attr, attrValue);
            }
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
        }
    }
    _attributeToProperty(name, value) {
        // Use tracking info to avoid deserializing attribute value if it was
        // just set from a property setter.
        if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
            return;
        }
        const ctor = this.constructor;
        // Note, hint this as an `AttributeMap` so closure clearly understands
        // the type; it has issues with tracking types through statics
        // tslint:disable-next-line:no-unnecessary-type-assertion
        const propName = ctor._attributeToPropertyMap.get(name);
        if (propName !== undefined) {
            const options = ctor.getPropertyOptions(propName);
            // mark state reflecting
            this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
            this[propName] =
                // tslint:disable-next-line:no-any
                ctor._propertyValueFromAttribute(value, options);
            // mark state not reflecting
            this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
        }
    }
    /**
     * This private version of `requestUpdate` does not access or return the
     * `updateComplete` promise. This promise can be overridden and is therefore
     * not free to access.
     */
    _requestUpdate(name, oldValue) {
        let shouldRequestUpdate = true;
        // If we have a property key, perform property update steps.
        if (name !== undefined) {
            const ctor = this.constructor;
            const options = ctor.getPropertyOptions(name);
            if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                if (!this._changedProperties.has(name)) {
                    this._changedProperties.set(name, oldValue);
                }
                // Add to reflecting properties set.
                // Note, it's important that every change has a chance to add the
                // property to `_reflectingProperties`. This ensures setting
                // attribute + property reflects correctly.
                if (options.reflect === true &&
                    !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                    if (this._reflectingProperties === undefined) {
                        this._reflectingProperties = new Map();
                    }
                    this._reflectingProperties.set(name, options);
                }
            }
            else {
                // Abort the request if the property should not be considered changed.
                shouldRequestUpdate = false;
            }
        }
        if (!this._hasRequestedUpdate && shouldRequestUpdate) {
            this._updatePromise = this._enqueueUpdate();
        }
    }
    /**
     * Requests an update which is processed asynchronously. This should
     * be called when an element should update based on some state not triggered
     * by setting a property. In this case, pass no arguments. It should also be
     * called when manually implementing a property setter. In this case, pass the
     * property `name` and `oldValue` to ensure that any configured property
     * options are honored. Returns the `updateComplete` Promise which is resolved
     * when the update completes.
     *
     * @param name {PropertyKey} (optional) name of requesting property
     * @param oldValue {any} (optional) old value of requesting property
     * @returns {Promise} A Promise that is resolved when the update completes.
     */
    requestUpdate(name, oldValue) {
        this._requestUpdate(name, oldValue);
        return this.updateComplete;
    }
    /**
     * Sets up the element to asynchronously update.
     */
    async _enqueueUpdate() {
        this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
        try {
            // Ensure any previous update has resolved before updating.
            // This `await` also ensures that property changes are batched.
            await this._updatePromise;
        }
        catch (e) {
            // Ignore any previous errors. We only care that the previous cycle is
            // done. Any error should have been handled in the previous update.
        }
        const result = this.performUpdate();
        // If `performUpdate` returns a Promise, we await it. This is done to
        // enable coordinating updates with a scheduler. Note, the result is
        // checked to avoid delaying an additional microtask unless we need to.
        if (result != null) {
            await result;
        }
        return !this._hasRequestedUpdate;
    }
    get _hasRequestedUpdate() {
        return (this._updateState & STATE_UPDATE_REQUESTED);
    }
    get hasUpdated() {
        return (this._updateState & STATE_HAS_UPDATED);
    }
    /**
     * Performs an element update. Note, if an exception is thrown during the
     * update, `firstUpdated` and `updated` will not be called.
     *
     * You can override this method to change the timing of updates. If this
     * method is overridden, `super.performUpdate()` must be called.
     *
     * For instance, to schedule updates to occur just before the next frame:
     *
     * ```
     * protected async performUpdate(): Promise<unknown> {
     *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
     *   super.performUpdate();
     * }
     * ```
     */
    performUpdate() {
        // Mixin instance properties once, if they exist.
        if (this._instanceProperties) {
            this._applyInstanceProperties();
        }
        let shouldUpdate = false;
        const changedProperties = this._changedProperties;
        try {
            shouldUpdate = this.shouldUpdate(changedProperties);
            if (shouldUpdate) {
                this.update(changedProperties);
            }
            else {
                this._markUpdated();
            }
        }
        catch (e) {
            // Prevent `firstUpdated` and `updated` from running when there's an
            // update exception.
            shouldUpdate = false;
            // Ensure element can accept additional updates after an exception.
            this._markUpdated();
            throw e;
        }
        if (shouldUpdate) {
            if (!(this._updateState & STATE_HAS_UPDATED)) {
                this._updateState = this._updateState | STATE_HAS_UPDATED;
                this.firstUpdated(changedProperties);
            }
            this.updated(changedProperties);
        }
    }
    _markUpdated() {
        this._changedProperties = new Map();
        this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
    }
    /**
     * Returns a Promise that resolves when the element has completed updating.
     * The Promise value is a boolean that is `true` if the element completed the
     * update without triggering another update. The Promise result is `false` if
     * a property was set inside `updated()`. If the Promise is rejected, an
     * exception was thrown during the update.
     *
     * To await additional asynchronous work, override the `_getUpdateComplete`
     * method. For example, it is sometimes useful to await a rendered element
     * before fulfilling this Promise. To do this, first await
     * `super._getUpdateComplete()`, then any subsequent state.
     *
     * @returns {Promise} The Promise returns a boolean that indicates if the
     * update resolved without triggering another update.
     */
    get updateComplete() {
        return this._getUpdateComplete();
    }
    /**
     * Override point for the `updateComplete` promise.
     *
     * It is not safe to override the `updateComplete` getter directly due to a
     * limitation in TypeScript which means it is not possible to call a
     * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
     * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
     * This method should be overridden instead. For example:
     *
     *   class MyElement extends LitElement {
     *     async _getUpdateComplete() {
     *       await super._getUpdateComplete();
     *       await this._myChild.updateComplete;
     *     }
     *   }
     */
    _getUpdateComplete() {
        return this._updatePromise;
    }
    /**
     * Controls whether or not `update` should be called when the element requests
     * an update. By default, this method always returns `true`, but this can be
     * customized to control when to update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    shouldUpdate(_changedProperties) {
        return true;
    }
    /**
     * Updates the element. This method reflects property values to attributes.
     * It can be overridden to render and keep updated element DOM.
     * Setting properties inside this method will *not* trigger
     * another update.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    update(_changedProperties) {
        if (this._reflectingProperties !== undefined &&
            this._reflectingProperties.size > 0) {
            // Use forEach so this works even if for/of loops are compiled to for
            // loops expecting arrays
            this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
            this._reflectingProperties = undefined;
        }
        this._markUpdated();
    }
    /**
     * Invoked whenever the element is updated. Implement to perform
     * post-updating tasks via DOM APIs, for example, focusing an element.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    updated(_changedProperties) {
    }
    /**
     * Invoked when the element is first updated. Implement to perform one time
     * work on the element after update.
     *
     * Setting properties inside this method will trigger the element to update
     * again after this update cycle completes.
     *
     * @param _changedProperties Map of changed properties with old values
     */
    firstUpdated(_changedProperties) {
    }
}
_a = finalized;
/**
 * Marks class as having finished creating properties.
 */
UpdatingElement[_a] = true;

/**
@license
Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
This code may only be used under the BSD style license found at
http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
part of the polymer project is also subject to an additional IP rights grant
found at http://polymer.github.io/PATENTS.txt
*/
const supportsAdoptingStyleSheets = ('adoptedStyleSheets' in Document.prototype) &&
    ('replace' in CSSStyleSheet.prototype);
const constructionToken = Symbol();
class CSSResult {
    constructor(cssText, safeToken) {
        if (safeToken !== constructionToken) {
            throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
        }
        this.cssText = cssText;
    }
    // Note, this is a getter so that it's lazy. In practice, this means
    // stylesheets are not created until the first element instance is made.
    get styleSheet() {
        if (this._styleSheet === undefined) {
            // Note, if `adoptedStyleSheets` is supported then we assume CSSStyleSheet
            // is constructable.
            if (supportsAdoptingStyleSheets) {
                this._styleSheet = new CSSStyleSheet();
                this._styleSheet.replaceSync(this.cssText);
            }
            else {
                this._styleSheet = null;
            }
        }
        return this._styleSheet;
    }
    toString() {
        return this.cssText;
    }
}
const textFromCSSResult = (value) => {
    if (value instanceof CSSResult) {
        return value.cssText;
    }
    else if (typeof value === 'number') {
        return value;
    }
    else {
        throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
    }
};
/**
 * Template tag which which can be used with LitElement's `style` property to
 * set element styles. For security reasons, only literal string values may be
 * used. To incorporate non-literal values `unsafeCSS` may be used inside a
 * template string part.
 */
const css = (strings, ...values) => {
    const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
    return new CSSResult(cssText, constructionToken);
};

/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
// IMPORTANT: do not change the property name or the assignment expression.
// This line will be used in regexes to search for LitElement usage.
// TODO(justinfagnani): inject version number at build time
(window['litElementVersions'] || (window['litElementVersions'] = []))
    .push('2.3.1');
/**
 * Sentinal value used to avoid calling lit-html's render function when
 * subclasses do not implement `render`
 */
const renderNotImplemented = {};
class LitElement extends UpdatingElement {
    /**
     * Return the array of styles to apply to the element.
     * Override this method to integrate into a style management system.
     *
     * @nocollapse
     */
    static getStyles() {
        return this.styles;
    }
    /** @nocollapse */
    static _getUniqueStyles() {
        // Only gather styles once per class
        if (this.hasOwnProperty(JSCompiler_renameProperty('_styles', this))) {
            return;
        }
        // Take care not to call `this.getStyles()` multiple times since this
        // generates new CSSResults each time.
        // TODO(sorvell): Since we do not cache CSSResults by input, any
        // shared styles will generate new stylesheet objects, which is wasteful.
        // This should be addressed when a browser ships constructable
        // stylesheets.
        const userStyles = this.getStyles();
        if (userStyles === undefined) {
            this._styles = [];
        }
        else if (Array.isArray(userStyles)) {
            // De-duplicate styles preserving the _last_ instance in the set.
            // This is a performance optimization to avoid duplicated styles that can
            // occur especially when composing via subclassing.
            // The last item is kept to try to preserve the cascade order with the
            // assumption that it's most important that last added styles override
            // previous styles.
            const addStyles = (styles, set) => styles.reduceRight((set, s) => 
            // Note: On IE set.add() does not return the set
            Array.isArray(s) ? addStyles(s, set) : (set.add(s), set), set);
            // Array.from does not work on Set in IE, otherwise return
            // Array.from(addStyles(userStyles, new Set<CSSResult>())).reverse()
            const set = addStyles(userStyles, new Set());
            const styles = [];
            set.forEach((v) => styles.unshift(v));
            this._styles = styles;
        }
        else {
            this._styles = [userStyles];
        }
    }
    /**
     * Performs element initialization. By default this calls `createRenderRoot`
     * to create the element `renderRoot` node and captures any pre-set values for
     * registered properties.
     */
    initialize() {
        super.initialize();
        this.constructor._getUniqueStyles();
        this.renderRoot =
            this.createRenderRoot();
        // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
        // element's getRootNode(). While this could be done, we're choosing not to
        // support this now since it would require different logic around de-duping.
        if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
            this.adoptStyles();
        }
    }
    /**
     * Returns the node into which the element should render and by default
     * creates and returns an open shadowRoot. Implement to customize where the
     * element's DOM is rendered. For example, to render into the element's
     * childNodes, return `this`.
     * @returns {Element|DocumentFragment} Returns a node into which to render.
     */
    createRenderRoot() {
        return this.attachShadow({ mode: 'open' });
    }
    /**
     * Applies styling to the element shadowRoot using the `static get styles`
     * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
     * available and will fallback otherwise. When Shadow DOM is polyfilled,
     * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
     * is available but `adoptedStyleSheets` is not, styles are appended to the
     * end of the `shadowRoot` to [mimic spec
     * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
     */
    adoptStyles() {
        const styles = this.constructor._styles;
        if (styles.length === 0) {
            return;
        }
        // There are three separate cases here based on Shadow DOM support.
        // (1) shadowRoot polyfilled: use ShadyCSS
        // (2) shadowRoot.adoptedStyleSheets available: use it.
        // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
        // rendering
        if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
            window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
        }
        else if (supportsAdoptingStyleSheets) {
            this.renderRoot.adoptedStyleSheets =
                styles.map((s) => s.styleSheet);
        }
        else {
            // This must be done after rendering so the actual style insertion is done
            // in `update`.
            this._needsShimAdoptedStyleSheets = true;
        }
    }
    connectedCallback() {
        super.connectedCallback();
        // Note, first update/render handles styleElement so we only call this if
        // connected after first update.
        if (this.hasUpdated && window.ShadyCSS !== undefined) {
            window.ShadyCSS.styleElement(this);
        }
    }
    /**
     * Updates the element. This method reflects property values to attributes
     * and calls `render` to render DOM via lit-html. Setting properties inside
     * this method will *not* trigger another update.
     * @param _changedProperties Map of changed properties with old values
     */
    update(changedProperties) {
        // Setting properties in `render` should not trigger an update. Since
        // updates are allowed after super.update, it's important to call `render`
        // before that.
        const templateResult = this.render();
        super.update(changedProperties);
        // If render is not implemented by the component, don't call lit-html render
        if (templateResult !== renderNotImplemented) {
            this.constructor
                .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
        }
        // When native Shadow DOM is used but adoptedStyles are not supported,
        // insert styling after rendering to ensure adoptedStyles have highest
        // priority.
        if (this._needsShimAdoptedStyleSheets) {
            this._needsShimAdoptedStyleSheets = false;
            this.constructor._styles.forEach((s) => {
                const style = document.createElement('style');
                style.textContent = s.cssText;
                this.renderRoot.appendChild(style);
            });
        }
    }
    /**
     * Invoked on each update to perform rendering tasks. This method may return
     * any value renderable by lit-html's NodePart - typically a TemplateResult.
     * Setting properties inside this method will *not* trigger the element to
     * update.
     */
    render() {
        return renderNotImplemented;
    }
}
/**
 * Ensure this class is marked as `finalized` as an optimization ensuring
 * it will not needlessly try to `finalize`.
 *
 * Note this property name is a string to prevent breaking Closure JS Compiler
 * optimizations. See updating-element.ts for more information.
 */
LitElement['finalized'] = true;
/**
 * Render method used to render the value to the element's DOM.
 * @param result The value to render.
 * @param container Node into which to render.
 * @param options Element name.
 * @nocollapse
 */
LitElement.render = render$1;

var defaultStyles = css`
  :host([type='default']) .line--top {
    top: 4px;
    animation: default__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
      
  :host([type='default'][active]) .line--top {
    top: 4px;
    animation: default__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='default']) .line--middle {
    top: 10px;
    animation: default__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='default'][active]) .line--middle {
    top: 10px;
    animation: default__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='default']) .line--bottom {
    top: 16px;
    animation: default__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='default'][active]) .line--bottom {
    top: 16px;
    animation: default__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
      
  @keyframes default__line-top-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(-45deg);
    }

    30% {
      top: 10px;
      transform: rotate(0deg);
    }

    60% {
      top: 10px;
    }

    100% {
      top: 4px;
    }
  }

  @keyframes default__line-top-animation--activate {
    0% {
      top: 4px;
    }

    30% {
      top: 10px;
    }

    60% {
      top: 10px;
      transform: rotate(0deg);
    }

    100% {
      top: 10px;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes default__line-middle-animation--deactivate {
    0% {
      opacity: 0;
    }

    30% {
      opacity: 0;
    }

    60% {
      opacity: 1;
    }

    100% {
      opacity: 1;
    }
  }

  @keyframes default__line-middle-animation--activate {
    0% {
      opacity: 1;
    }
  
    30% {
      opacity: 1;
    }
  
    60% {
      opacity: 0;
    }
  
    100% {
      opacity: 0;
    }
  }
  
  @keyframes default__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(45deg);
    }

    30% {
      top: 10px;
      transform: rotate(0deg);
    }

    60% {
      top: 10px;
    }

    100% {
      top: 16px;
    }
  }

  @keyframes default__line-bottom-animation--activate {
    0% {
      top: 16px;
    }
  
    30% {
      top: 10px;
    }
  
    60% {
      top: 10px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(45deg);
    }
  }
`;

var arrowLeftStyles = css`
  :host([type='arrow-left']) .line--top {
    top: 0;
    animation: arrow-left__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-left'][active]) .line--top {
    animation: arrow-left__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-left']) .line--middle {
    top: 10px;
  }
  
  :host([type='arrow-left']) .line--bottom {
    top: 20px;
    animation: arrow-left__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-left'][active]) .line--bottom {
    animation: arrow-left__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes arrow-left__line-top-animation--deactivate {
    0% {
      top: 2px;
      width: 14px;
      left: 0;
      transform: rotate(-45deg);
    }

    30% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }

    60% {
      top: 10px;
    }

    100% {
      top: 4px;
      left: 1px;
    }
  }
  
  @keyframes arrow-left__line-top-animation--activate {
    0% {
      top: 4px;
      left: 1px;
    }

    30% {
      top: 10px;
    }

    60% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }

    100% {
      top: 5px;
      width: 14px;
      left: 0;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes arrow-left__line-bottom-animation--deactivate {
    0% {
      top: 15px;
      width: 14px;
      left: 0;
      transform: rotate(45deg);
    }
  
    30% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
    }
  
    100% {
      top: 16px;
      left: 1px;
    }
  }
  
  @keyframes arrow-left__line-bottom-animation--activate {
    0% {
      top: 16px;
      left: 1px;
    }
  
    30% {
      top: 10px;
    }
  
    60% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 15px;
      width: 14px;
      left: 0;
      transform: rotate(45deg);
    }
  }
`;

var arrowRightStyles = css`
  :host([type='arrow-right']) .line--top {
    top: 0;
    animation: arrow-right__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-right'][active]) .line--top {
    animation: arrow-right__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-right']) .line--middle {
    top: 10px;
  }
  
  :host([type='arrow-right']) .line--bottom {
    top: 20px;
    animation: arrow-right__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-right'][active]) .line--bottom {
    animation: arrow-right__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes arrow-right__line-top-animation--deactivate {
    0% {
      top: 2px;
      width: 14px;
      left: 8px;
      transform: rotate(45deg);
    }

    30% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }

    60% {
      top: 10px;
    }

    100% {
      top: 4px;
      left: 1px;
    }
  }
  
  @keyframes arrow-right__line-top-animation--activate {
    0% {
      top: 4px;
      left: 1px;
    }

    30% {
      top: 10px;
    }

    60% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }

    100% {
      top: 5px;
      width: 14px;
      left: 8px;
      transform: rotate(45deg);
    }
  }
  
  @keyframes arrow-right__line-bottom-animation--deactivate {
    0% {
      top: 15px;
      width: 14px;
      left: 8px;
      transform: rotate(-45deg);
    }
  
    30% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
    }
  
    100% {
      top: 16px;
      left: 1px;
    }
  }
  
  @keyframes arrow-right__line-bottom-animation--activate {
    0% {
      top: 16px;
      left: 1px;
    }
  
    30% {
      top: 10px;
    }
  
    60% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 15px;
      width: 14px;
      left: 8px;
      transform: rotate(-45deg);
    }
  }
`;

var astronautStyles = css`
  :host([type='astronaut']) .line--top {
    top: 4px;
    animation: astronaut__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
      
  :host([type='astronaut'][active]) .line--top {
    top: 4px;
    animation: astronaut__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='astronaut']) .line--middle {
    top: 10px;
    animation: astronaut__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='astronaut'][active]) .line--middle {
    top: 10px;
    animation: astronaut__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='astronaut']) .line--bottom {
    top: 16px;
    animation: astronaut__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='astronaut'][active]) .line--bottom {
    top: 16px;
    animation: astronaut__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
      
  @keyframes astronaut__line-top-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(-45deg);
      opacity: 1;
    }

    48% {
      top: 20px;
      transform: rotate(-45deg);
      opacity: 0;
    }

    52% {
      top: -6px;
      transform: rotate(0deg);
      opacity: 0;
    }

    100% {
      top: 4px;
      opacity: 1;
    }
  }

  @keyframes astronaut__line-top-animation--activate {
    0% {
      top: 4px;
      opacity: 1;
    }

    48% {
      top: -6px;
      opacity: 0;
      transform: rotate(0deg);
    }

    52% {
      top: 20px;
      transform: rotate(-45deg);
      opacity: 0;
    }

    100% {
      top: 10px;
      transform: rotate(-45deg);
      opacity: 1;
    }
  }
  
  @keyframes astronaut__line-middle-animation--deactivate {
    0% {
      top: 10px;
      opacity: 0;
    }

    48% {
      top: 20px;
    }

    52% {
      top: 0px;
      opacity: 0;
    }

    100% {
      top: 10px;
      opacity: 1;
    }
  }

  @keyframes astronaut__line-middle-animation--activate {
    0% {
      top: 10px;
      opacity: 1;
    }

    48% {
      top: 0px;
      opacity: 0;
    }

    52% {
      top: 20px;
    }

    100% {
      top: 10px;
      opacity: 0;
    }
  }
  
  @keyframes astronaut__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(45deg);
      opacity: 1;
    }

    48% {
      top: 20px;
      transform: rotate(45deg);
      opacity: 0;
    }

    52% {
      top: 6px;
      transform: rotate(0deg);
      opacity: 0;
    }

    100% {
      top: 16px;
      opacity: 1;
    }
  }

  @keyframes astronaut__line-bottom-animation--activate {
    0% {
      top: 16px;
      opacity: 1;
    }
  
    48% {
      top: 6px;
      transform: rotate(0deg);
      opacity: 0;
    }
  
    52% {
      top: 20px;
      transform: rotate(45deg);
      opacity: 0;
    }
  
    100% {
      top: 10px;
      transform: rotate(45deg);
      opacity: 1;
    }
  }
`;

var asyncStyles = css`
  :host([type='async']) .line--top {
    top: 4px;
    animation: async__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='async'][active]) .line--top {
        animation: async__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='async']) .line--middle {
    top: 10px;
    animation: async__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='async'][active]) .line--middle {
    animation: async__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='async']) .line--bottom {
    top: 16px;
    animation: async__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='async'][active]) .line--bottom {
    animation: async__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes async__line-top-animation--deactivate {
    0% {
      width: 20px;
      top: 10px;
      transform: rotate(-45deg);
    }
  
    20%,
    80% {
      width: 0;
    }
  
    100% {
      width: 20px;
    }
  }
  
  @keyframes async__line-top-animation--activate {
    0% {
      width: 20px;
    }
  
    20%,
    80% {
      width: 0;
    }
    
    100% {
      width: 20px;
      top: 10px;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes async__line-middle-animation--deactivate {
    0%,
    60% {
      width: 0;
    }
  
    80%,
    100% {
      width: 20px;
    }
  }
  
  @keyframes async__line-middle-animation--activate {
    0%,
    20% {
      width: 20px;
    }
  
    40%,
    100% {
      width: 0;
    }
  }
  
  @keyframes async__line-bottom-animation--deactivate {
    0% {
      width: 20px;
      top: 10px;
      transform: rotate(45deg);
    }
  
    20%,
    40% {
      width: 0;
      top: 20px;
      transform: rotate(0deg);
    }
  
    60%,
    100% {
      width: 20px;
    }
  }
  
  @keyframes async__line-bottom-animation--activate {
    0%,
    40% {
      width: 20px;
    }
  
    60%,
    80% {
      width: 0;
      top: 20px;
      transform: rotate(0deg);
    }
  
    100% {
      width: 20px;
      top: 10px;
      transform: rotate(45deg);
    }
  }
`;

var crossedStyles = css`
  :host([type='crossed']) .line--top {
    top: 0;
    animation: crossed__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='crossed'][active]) .line--top {
    animation: crossed__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='crossed']) .line--middle {
    top: 10px;
    animation: crossed__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='crossed'][active]) .line--middle {
    animation: crossed__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='crossed']) .line--bottom {
    top: 20px;
    animation: crossed__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='crossed'][active]) .line--bottom {
    animation: crossed__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes crossed__line-top-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(-45deg);
    }
  
    30% {
      top: 10px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
    }
  
    100% {
      top: 4px;
    }
  }
  
  @keyframes crossed__line-top-animation--activate {
    0% {
      top: 4px;
    }
  
    30% {
      top: 10px;
    }
  
    60% {
      top: 10px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes crossed__line-middle-animation--deactivate {
    0% {
      opacity: 1;
    }
  
    30% {
      opacity: 0;
    }
  
    60% {
      opacity: 1;
    }
  
    100% {
      opacity: 1;
    }
  }
  
  @keyframes crossed__line-middle-animation--activate {
    0% {
      opacity: 1;
    }
  
    30% {
      opacity: 1;
    }
  
    60% {
      opacity: 0;
    }
  
    100% {
      opacity: 1;
    }
  }
  
  @keyframes crossed__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(45deg);
    }
  
    30% {
      top: 10px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
    }
  
    100% {
      top: 16px;
    }
  }
  
  @keyframes crossed__line-bottom-animation--activate {
    0% {
      top: 16px;
    }
  
    30% {
      top: 10px;
    }
  
    60% {
      top: 10px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(45deg);
    }
  }
`;

var ellipsisStyles = css`
  :host([type='ellipsis']) .line--top {
    top: 0;
    animation: ellipsis__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='ellipsis'][active]) .line--top {
    animation: ellipsis__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='ellipsis']) .line--middle {
    top: 10px;
    animation: ellipsis__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='ellipsis'][active]) .line--middle {
    animation: ellipsis__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='ellipsis']) .line--bottom {
    top: 20px;
    animation: ellipsis__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='ellipsis'][active]) .line--bottom {
    animation: ellipsis__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes ellipsis__line-top-animation--deactivate {
    0% {
      top: 10px;
      left: 2px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 4px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  }
  
  @keyframes ellipsis__line-top-animation--activate {
    0% {
      top: 4px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 10px;
      left: 2px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  }
  
  @keyframes ellipsis__line-middle-animation--deactivate {
    0% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  }
  
  @keyframes ellipsis__line-middle-animation--activate {
    0% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  }
  
  @keyframes ellipsis__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      left: 18px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 16px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  }
  
  @keyframes ellipsis__line-bottom-animation--activate {
    0% {
      top: 16px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
    }
  
    30% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    60% {
      top: 10px;
      left: 10px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  
    100% {
      top: 10px;
      left: 18px;
      width: 4px;
      height: 4px;
      border-radius: 3px;
    }
  }
`;

var fallDownStyles = css`
  :host([type='fall-down']) .line--top {
    top: 0;
    animation: fall-down__line-top-animation--deactivate  var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='fall-down'][active]) .line--top {
    animation: fall-down__line-top-animation--activate  var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='fall-down']) .line--middle {
    top: 10px;
    animation: fall-down__line-middle-animation--deactivate .var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='fall-down'][active]) .line--middle {
    animation: fall-down__line-middle-animation--activate  var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='fall-down']) .line--bottom {
    top: 20px;
    animation: fall-down__line-bottom-animation--deactivate  var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='fall-down'][active]) .line--bottom {
    animation: fall-down__line-bottom-animation--activate  var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes fall-down__line-top-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(-45deg);
    }
  
    30% {
      top: 16px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 16px;
    }
  
    100% {
      top: 4px;
    }
  }
  
  @keyframes fall-down__line-top-animation--activate {
    0% {
      top: 4px;
    }
  
    30% {
      top: 16px;
    }
  
    60% {
      top: 16px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes fall-down__line-middle-animation--deactivate {
    0% {
      opacity: 0;
    }
  
    30% {
      top: 16px;
      opacity: 0;
    }
  
    60% {
      top: 16px;
      opacity: 1;
    }
  
    100% {
      top: 10px;
      opacity: 1;
    }
  }
  
  @keyframes fall-down__line-middle-animation--activate {
    0% {
      top: 10px;
      opacity: 1;
    }
  
    30% {
      top: 16px;
      opacity: 1;
    }
  
    60% {
      top: 16px;
      opacity: 0;
    }
  
    100% {
      opacity: 0;
    }
  }
  
  @keyframes fall-down__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(45deg);
    }
  
    30% {
      top: 16px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 16px;
    }
  
    100% {
      top: 16px;
    }
  }
  
  @keyframes fall-down__line-bottom-animation--activate {
    0% {
      top: 16px;
    }
  
    30% {
      top: 16px;
    }
  
    60% {
      top: 16px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(45deg);
    }
  }
`;

var minusStyles = css`
  :host([type='minus']) .line--top {
    top: 4px;
    animation: minus__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='minus'][active]) .line--top {
    animation: minus__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='minus']) .line--middle {
    top: 10px;
  }
  
  :host([type='minus']) .line--bottom {
    top: 16px;
    animation: minus__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='minus'][active]) .line--bottom {
    animation: minus__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes minus__line-top-animation--deactivate {
    0% {
      top: 10px;
    }
  
    100% {
      top: 4px;
    }
  }
  
  @keyframes minus__line-top-animation--activate {
    0% {
      top: 4px;
    }
  
    100% {
      top: 10px;
    }
  }
  
  @keyframes minus__line-bottom-animation--deactivate {
    0% {
      top: 10px;
    }
  
    100% {
      top: 16px;
    }
  }
  
  @keyframes minus__line-bottom-animation--activate {
    0% {
      top: 16px;
    }
  
    100% {
      top: 10px;
    }
  }
`;

var rotatorStyles = css`
  :host([type='rotator']) .line--top {
    top: 4px;
    animation: rotator__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='rotator'][active]) .line--top {
    animation: rotator__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='rotator']) .line--middle {
    top: 10px;
    animation: rotator__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='rotator'][active]) .line--middle {
    animation: rotator__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='rotator']) .line--bottom {
    top: 16px;
    animation: rotator__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='rotator'][active]) .line--bottom {
    animation: rotator__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes rotator__line-top-animation--deactivate {
    0% {
      transform: rotate(315deg);
      top: 10px;
    }
  
    40%,
    70% {
      transform: rotate(180deg);
      top: 10px;
    }
  
    100% {
      transform: rotate(0);
      top: 4px;
    }
  }
  
  @keyframes rotator__line-top-animation--activate {
    0% {
      transform: rotate(0);
      top: 4px;
    }
  
    30%,
    60% {
      transform: rotate(180deg);
      top: 10px;
    }
  
    100% {
      transform: rotate(315deg);
      top: 10px;
    }
  }
  
  @keyframes rotator__line-middle-animation--deactivate {
    0%,
    40% {
      opacity: 0;
    }
  
    70% {
      transform: rotate(180deg);
      opacity: 0;
    }
  
    100% {
      transform: rotate(0)
    }
  }
  
  @keyframes rotator__line-middle-animation--activate {
    0% {
      transform: rotate(0)
    }
  
    30% {
      transform: rotate(180deg);
      opacity: 0;
    }
  
    60%,
    100% {
      opacity: 0;
    }
  }
  
  @keyframes rotator__line-bottom-animation--deactivate {
    0% {
      transform: rotate(405deg);
      top: 10px;
    }
  
    40%,
    70% {
      top: 10px;
      transform: rotate(180deg);
    }
  
    100% {
      transform: rotate(0);
      top: 16px;
    }
  }
  
  @keyframes rotator__line-bottom-animation--activate {
    0% {
      transform: rotate(0);
      top: 16px;
    }
  
    30%,
    60% {
      top: 10px;
      transform: rotate(180deg);
    }
  
    100% {
      transform: rotate(405deg);
      top: 10px;
    }
  }
`;

var spinStyles = css`
  :host([type='spin']) .line--top {
    top: 0;
    animation: spin__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='spin'][active]) .line--top {
    animation: spin__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='spin']) .line--middle {
    top: 10px;
    animation: spin__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='spin'][active]) .line--middle {
    animation: spin__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='spin']) .line--bottom {
    top: 20px;
    animation: spin__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='spin'][active]) .line--bottom {
    animation: spin__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes spin__line-top-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(315deg);
    }
  
    100% {
      top: 4px;
      transform: rotate(0deg);
    }
  }
  
  @keyframes spin__line-top-animation--activate {
    0% {
      top: 4px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 10px;
      transform: rotate(315deg);
    }
  }
  
  @keyframes spin__line-middle-animation--deactivate {
    0% {
      opacity: 0;
      transform: rotate(360deg);
    }
  
    100% {
      opacity: 1;
      transform: rotate(0deg);
    }
  }
  
  @keyframes spin__line-middle-animation--activate {
    0% {
      opacity: 1;
      transform: rotate(0deg);
    }
  
    100% {
      opacity: 0;
      transform: rotate(360deg);
    }
  }
  
  @keyframes spin__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      transform: rotate(405deg);
    }
  
    100% {
      top: 16px;
      transform: rotate(0deg);
    }
  }
  
  @keyframes spin__line-bottom-animation--activate {
    0% {
      top: 16px;
      transform: rotate(0deg);
    }
  
  100% {
      top: 10px;
      transform: rotate(405deg);
    }
  }
`;

var underlinedStyles = css`
  :host([type='underlined']) .line--top {
    top: 4px;
    animation: underlined__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='underlined'][active]) .line--top {
    animation: underlined__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='underlined']) .line--middle {
    top: 10px;
    animation: underlined__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='underlined'][active]) .line--middle {
    animation: underlined__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='underlined']) .line--bottom {
    top: 16px;
    animation: underlined__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='underlined'][active]) .line--bottom {
    animation: underlined__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes underlined__line-top-animation--deactivate {
    0% {
      width: 20px;
      top: 4px;
      left: 1px;
      transform: rotate(-135deg);
    }
  
    100% {
      transform: rotate(0deg);
    }
  }
  
  @keyframes underlined__line-top-animation--activate {
    0% {
      transform: rotate(0deg);
    }
  
    100% {
      width: 20px;
      top: 4px;
      left: 1px;
      transform: rotate(-135deg);
    }
  }
  
  @keyframes underlined__line-middle-animation--deactivate {
    0% {
      width: 20px;
      transform: rotate(135deg);
      top: 4px;
      left: 1px;
    }
  
    100% {
      transform: rotate(0deg);
      top: 10px;
    }
  }
  
  @keyframes underlined__line-middle-animation--activate {
    0% {
      transform: rotate(0deg);
      top: 10px;
    }
  
    100% {
      width: 20px;
      transform: rotate(135deg);
      top: 4px;
      left: 1px;
    }
  }
  
  @keyframes underlined__line-bottom-animation--deactivate {
    0% {
      width: 20px;
      left: 1px;
    }
  
    100% {
      width: 20px;
      left: 1px;
    }
  }
  
  @keyframes underlined__line-bottom-animation--activate {
    0% {
      width: 20px;
      left: 1px;
    }
  
    100% {
      width: 20px;
      left: 1px;
    }
  }
`;

var verticalRotatorStyles = css`
  :host([type='vertical-rotator']) .line--top {
    top: 4px;
    animation: vertical-rotator__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='vertical-rotator'][active]) .line--top {
    animation: vertical-rotator__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='vertical-rotator']) .line--middle {
    top: 10px;
    animation: vertical-rotator__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='vertical-rotator'][active]) .line--middle {
    animation: vertical-rotator__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='vertical-rotator']) .line--bottom {
    top: 16px;
    animation: vertical-rotator__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='vertical-rotator'][active]) .line--bottom {
    animation: vertical-rotator__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes vertical-rotator__line-top-animation--deactivate {
    0% {
      transform: rotate(135deg);
      top: 9px;
    }
  
    40%,
    70% {
      transform: rotate(90deg);
      top: 9px;
    }
  
    100% {
      transform: rotate(0);
      top: 4px;
    }
  }
  
  @keyframes vertical-rotator__line-top-animation--activate {
    0% {
      transform: rotate(0);
      top: 4px;
    }
  
    30%,
    60% {
      transform: rotate(90deg);
      top: 9px;
      color: red;
    }
  
    100% {
      transform: rotate(135deg);
      top: 9px;
    }
  }
  
  @keyframes vertical-rotator__line-middle-animation--deactivate {
    0%,
    40% {
      opacity: 0;
    }
  
    70% {
      transform: rotate(90deg);
      opacity: 0;
    }
  
    100% {
      transform: rotate(0)
    }
  }
  
  @keyframes vertical-rotator__line-middle-animation--activate {
    0% {
      transform: rotate(0)
    }
  
    30% {
      transform: rotate(90deg);
      opacity: 0;
    }
  
    60%,
    100% {
      opacity: 0;
    }
  }
  
  @keyframes vertical-rotator__line-bottom-animation--deactivate {
    0% {
      transform: rotate(225deg);
      top: 9px;
    }
  
    40%,
    70% {
      top: 9px;
      transform: rotate(90deg);
    }
  
    100% {
      transform: rotate(0);
      top: 16px;
    }
  }
  
  @keyframes vertical-rotator__line-bottom-animation--activate {
    0% {
      transform: rotate(0);
      top: 16px;
    }
  
    30%,
    60% {
      top: 9px;
      transform: rotate(90deg);
    }
  
    100% {
      transform: rotate(225deg);
      top: 9px;
    }
  }
`;

var zoomStyles = css`
  :host([type='zoom']) .line--top {
    top: 4px;
    animation: zoom__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='zoom'][active]) .line--top {
    animation: zoom__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='zoom']) .line--middle {
    top: 10px;
    animation: zoom__line-middle-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='zoom'][active]) .line--middle {
    animation: zoom__line-middle-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='zoom']) .line--bottom {
    top: 16px;
    animation: zoom__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='zoom'][active]) .line--bottom {
    animation: zoom__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes zoom__line-top-animation--deactivate {
    0% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(45deg);
    }
  
    30% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(45deg);
    }
  
    60% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 1px;
      border-radius: 3px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 4px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(0deg);
    }
  }
  
  @keyframes zoom__line-top-animation--activate {
    0% {
      top: 4px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(0deg);
    }
  
    30% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 1px;
      border-radius: 3px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(45deg);
    }
  
    100% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(45deg);
    }
  }
  
  @keyframes zoom__line-middle-animation--deactivate {
    0%,
    60% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      opacity: 0;
    }
  
    100% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      opacity: 1;
    }
  }
  
  @keyframes zoom__line-middle-animation--activate {
    0% {
      top: 10px;
      left: 1xp;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      opacity: 1;
    }
  
    30%,
    100% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      opacity: 0;
    }
  }
  
  @keyframes zoom__line-bottom-animation--deactivate {
    0% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(-45deg);
    }
  
    30% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(-45deg);
    }
  
    60% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 16px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(0deg);
    }
  }
  
  @keyframes zoom__line-bottom-animation--activate {
    0% {
      top: 16px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(0deg);
    }
  
    30% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      left: 12px;
      width: 2px;
      height: 2px;
      border-radius: 1px;
      transform: rotate(-45deg);
    }
  
    100% {
      top: 10px;
      left: 1px;
      width: 20px;
      height: 3px;
      border-radius: var(--burgton-button-border-radius);
      transform: rotate(-45deg);
    }
  }
`;

var arrowToArrow = css`
  :host([type='arrow-to-arrow']) .line--top {
    top: 4px;
    animation: arrow-to-arrow__line-top-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-to-arrow'][active]) .line--top {
    animation: arrow-to-arrow__line-top-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  
  :host([type='arrow-to-arrow']) .line--middle {
    top: 10px;
  }
  
  :host([type='arrow-to-arrow']) .line--bottom {
    top: 16px;
    animation: arrow-to-arrow__line-bottom-animation--deactivate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  :host([type='arrow-to-arrow'][active]) .line--bottom {
    animation: arrow-to-arrow__line-bottom-animation--activate var(--burgton-button-animation-duration) var(--burgton-button-easing) var(--burgton-button-animation-delay) 1 normal forwards;
  }
  
  @keyframes arrow-to-arrow__line-top-animation--deactivate {
    0% {
      top: 5px;
      width: 14px;
      left: 0;
      transform: rotate(-45deg);
    }
  
    30% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 5px;
      width: 14px;
      left: 8px;
      transform: rotate(45deg);
    }
  }
  
  @keyframes arrow-to-arrow__line-top-animation--activate {
    0% {
      top: 5px;
      width: 14px;
      left: 8px;
      transform: rotate(45deg);
    }
  
    30% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      width: 20px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 5px;
      width: 14px;
      left: 0;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes arrow-to-arrow__line-bottom-animation--deactivate {
    0% {
      top: 15px;
      width: 14px;
      left: 0;
      transform: rotate(45deg);
    }
  
    30% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 15px;
      width: 14px;
      left: 8px;
      transform: rotate(-45deg);
    }
  }
  
  @keyframes arrow-to-arrow__line-bottom-animation--activate {
    0% {
      top: 15px;
      width: 14px;
      left: 8px;
      transform: rotate(-45deg);
    }
  
    30% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    60% {
      top: 10px;
      width: 16px;
      left: 1px;
      transform: rotate(0deg);
    }
  
    100% {
      top: 15px;
      width: 14px;
      left: 0;
      transform: rotate(45deg);
    }
  }
`;

var labelStyles = css`
  .label {
    position: absolute;
    font-size: var(--burgton-button-label-font-size);
    color: var(--burgton-button-label-font-color);
    font-weight: var(--burgton-button-label-font-weight);
    text-transform: var(--burgton-button-label-text-transform);
  }
  
  .label,
  :host([active]) .label {
    color: var(--burgton-button-label-font-color-active);
  }
  
  :host([labelPosition='bottom']) .label {
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
  }
  
  :host([labelPosition='top']) .label {
    top: 0;
    left: 50%;
    transform: translate(-50%, -100%);
  }
  
  :host([labelPosition='left']) .label {
    top: 50%;
    transform: translate(-100%, -50%);
    left: -5px;
  }
  
  :host([labelPosition='right']) .label {
    top: 50%;
    transform: translateY(-50%);
    left: calc(100% + 3px);
  }
`;

var styles = css`
      :host {
        box-sizing: border-box;
        position: relative;
        cursor: pointer;
        height: 24px;
        width: 24px;
        transform: scale(var(--burgton-button-scale));
        
        --burgton-button-default-line-color: #66cc99;
        
        --burgton-button-border-radius: 0px;
        --burgton-button-line-color: var(--burgton-button-default-line-color);
        --burgton-button-line-color-active: var(--burgton-button-line-color);
        --burgton-button-animation-duration: 500ms;
        --burgton-button-animation-delay: 0s;
        --burgton-button-easing: ease-in-out;
        --burgton-button-scale: 1;
        
        --burgton-button-label-font-size: 14px;
        --burgton-button-label-font-color: #999999;
        --burgton-button-label-font-color-active: #999999;
        --burgton-button-label-font-weight: inherit;
        --burgton-button-label-text-transform: uppercase;
      }
      
      .line {
        position: absolute;
        left: 1px;
        height: 3px;
        width: 20px;
        background-color: var(--burgton-button-line-color);
        border-radius: var(--burgton-button-border-radius);
      }
      
      :host([active]) .line {
        background-color: var(--burgton-button-line-color-active);
      }
      
      :host(:focus:not(.focus-visible)) {
        outline: none;
      }
      
      /* NO ANIMATION */
      :host([noAnimation]) .line--top,
      :host([noAnimation]) .line--middle,
      :host([noAnimation]) .line--bottom {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
      
      ${defaultStyles}
      ${arrowLeftStyles}
      ${arrowRightStyles}
      ${astronautStyles}
      ${asyncStyles}
      ${crossedStyles}
      ${ellipsisStyles}
      ${fallDownStyles}
      ${minusStyles}
      ${rotatorStyles}
      ${spinStyles}
      ${underlinedStyles}
      ${verticalRotatorStyles}
      ${zoomStyles}
      ${arrowToArrow}
      
      ${labelStyles}
`;

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (factory());
}(undefined, (function () {
  /**
   * Applies the :focus-visible polyfill at the given scope.
   * A scope in this case is either the top-level Document or a Shadow Root.
   *
   * @param {(Document|ShadowRoot)} scope
   * @see https://github.com/WICG/focus-visible
   */
  function applyFocusVisiblePolyfill(scope) {
    var hadKeyboardEvent = true;
    var hadFocusVisibleRecently = false;
    var hadFocusVisibleRecentlyTimeout = null;

    var inputTypesWhitelist = {
      text: true,
      search: true,
      url: true,
      tel: true,
      email: true,
      password: true,
      number: true,
      date: true,
      month: true,
      week: true,
      time: true,
      datetime: true,
      'datetime-local': true
    };

    /**
     * Helper function for legacy browsers and iframes which sometimes focus
     * elements like document, body, and non-interactive SVG.
     * @param {Element} el
     */
    function isValidFocusTarget(el) {
      if (
        el &&
        el !== document &&
        el.nodeName !== 'HTML' &&
        el.nodeName !== 'BODY' &&
        'classList' in el &&
        'contains' in el.classList
      ) {
        return true;
      }
      return false;
    }

    /**
     * Computes whether the given element should automatically trigger the
     * `focus-visible` class being added, i.e. whether it should always match
     * `:focus-visible` when focused.
     * @param {Element} el
     * @return {boolean}
     */
    function focusTriggersKeyboardModality(el) {
      var type = el.type;
      var tagName = el.tagName;

      if (tagName === 'INPUT' && inputTypesWhitelist[type] && !el.readOnly) {
        return true;
      }

      if (tagName === 'TEXTAREA' && !el.readOnly) {
        return true;
      }

      if (el.isContentEditable) {
        return true;
      }

      return false;
    }

    /**
     * Add the `focus-visible` class to the given element if it was not added by
     * the author.
     * @param {Element} el
     */
    function addFocusVisibleClass(el) {
      if (el.classList.contains('focus-visible')) {
        return;
      }
      el.classList.add('focus-visible');
      el.setAttribute('data-focus-visible-added', '');
    }

    /**
     * Remove the `focus-visible` class from the given element if it was not
     * originally added by the author.
     * @param {Element} el
     */
    function removeFocusVisibleClass(el) {
      if (!el.hasAttribute('data-focus-visible-added')) {
        return;
      }
      el.classList.remove('focus-visible');
      el.removeAttribute('data-focus-visible-added');
    }

    /**
     * If the most recent user interaction was via the keyboard;
     * and the key press did not include a meta, alt/option, or control key;
     * then the modality is keyboard. Otherwise, the modality is not keyboard.
     * Apply `focus-visible` to any current active element and keep track
     * of our keyboard modality state with `hadKeyboardEvent`.
     * @param {KeyboardEvent} e
     */
    function onKeyDown(e) {
      if (e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }

      if (isValidFocusTarget(scope.activeElement)) {
        addFocusVisibleClass(scope.activeElement);
      }

      hadKeyboardEvent = true;
    }

    /**
     * If at any point a user clicks with a pointing device, ensure that we change
     * the modality away from keyboard.
     * This avoids the situation where a user presses a key on an already focused
     * element, and then clicks on a different element, focusing it with a
     * pointing device, while we still think we're in keyboard modality.
     * @param {Event} e
     */
    function onPointerDown(e) {
      hadKeyboardEvent = false;
    }

    /**
     * On `focus`, add the `focus-visible` class to the target if:
     * - the target received focus as a result of keyboard navigation, or
     * - the event target is an element that will likely require interaction
     *   via the keyboard (e.g. a text box)
     * @param {Event} e
     */
    function onFocus(e) {
      // Prevent IE from focusing the document or HTML element.
      if (!isValidFocusTarget(e.target)) {
        return;
      }

      if (hadKeyboardEvent || focusTriggersKeyboardModality(e.target)) {
        addFocusVisibleClass(e.target);
      }
    }

    /**
     * On `blur`, remove the `focus-visible` class from the target.
     * @param {Event} e
     */
    function onBlur(e) {
      if (!isValidFocusTarget(e.target)) {
        return;
      }

      if (
        e.target.classList.contains('focus-visible') ||
        e.target.hasAttribute('data-focus-visible-added')
      ) {
        // To detect a tab/window switch, we look for a blur event followed
        // rapidly by a visibility change.
        // If we don't see a visibility change within 100ms, it's probably a
        // regular focus change.
        hadFocusVisibleRecently = true;
        window.clearTimeout(hadFocusVisibleRecentlyTimeout);
        hadFocusVisibleRecentlyTimeout = window.setTimeout(function() {
          hadFocusVisibleRecently = false;
        }, 100);
        removeFocusVisibleClass(e.target);
      }
    }

    /**
     * If the user changes tabs, keep track of whether or not the previously
     * focused element had .focus-visible.
     * @param {Event} e
     */
    function onVisibilityChange(e) {
      if (document.visibilityState === 'hidden') {
        // If the tab becomes active again, the browser will handle calling focus
        // on the element (Safari actually calls it twice).
        // If this tab change caused a blur on an element with focus-visible,
        // re-apply the class when the user switches back to the tab.
        if (hadFocusVisibleRecently) {
          hadKeyboardEvent = true;
        }
        addInitialPointerMoveListeners();
      }
    }

    /**
     * Add a group of listeners to detect usage of any pointing devices.
     * These listeners will be added when the polyfill first loads, and anytime
     * the window is blurred, so that they are active when the window regains
     * focus.
     */
    function addInitialPointerMoveListeners() {
      document.addEventListener('mousemove', onInitialPointerMove);
      document.addEventListener('mousedown', onInitialPointerMove);
      document.addEventListener('mouseup', onInitialPointerMove);
      document.addEventListener('pointermove', onInitialPointerMove);
      document.addEventListener('pointerdown', onInitialPointerMove);
      document.addEventListener('pointerup', onInitialPointerMove);
      document.addEventListener('touchmove', onInitialPointerMove);
      document.addEventListener('touchstart', onInitialPointerMove);
      document.addEventListener('touchend', onInitialPointerMove);
    }

    function removeInitialPointerMoveListeners() {
      document.removeEventListener('mousemove', onInitialPointerMove);
      document.removeEventListener('mousedown', onInitialPointerMove);
      document.removeEventListener('mouseup', onInitialPointerMove);
      document.removeEventListener('pointermove', onInitialPointerMove);
      document.removeEventListener('pointerdown', onInitialPointerMove);
      document.removeEventListener('pointerup', onInitialPointerMove);
      document.removeEventListener('touchmove', onInitialPointerMove);
      document.removeEventListener('touchstart', onInitialPointerMove);
      document.removeEventListener('touchend', onInitialPointerMove);
    }

    /**
     * When the polfyill first loads, assume the user is in keyboard modality.
     * If any event is received from a pointing device (e.g. mouse, pointer,
     * touch), turn off keyboard modality.
     * This accounts for situations where focus enters the page from the URL bar.
     * @param {Event} e
     */
    function onInitialPointerMove(e) {
      // Work around a Safari quirk that fires a mousemove on <html> whenever the
      // window blurs, even if you're tabbing out of the page. ¯\_(ツ)_/¯
      if (e.target.nodeName && e.target.nodeName.toLowerCase() === 'html') {
        return;
      }

      hadKeyboardEvent = false;
      removeInitialPointerMoveListeners();
    }

    // For some kinds of state, we are interested in changes at the global scope
    // only. For example, global pointer input, global key presses and global
    // visibility change should affect the state at every scope:
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    document.addEventListener('visibilitychange', onVisibilityChange, true);

    addInitialPointerMoveListeners();

    // For focus and blur, we specifically care about state changes in the local
    // scope. This is because focus / blur events that originate from within a
    // shadow root are not re-dispatched from the host element if it was already
    // the active element in its own scope:
    scope.addEventListener('focus', onFocus, true);
    scope.addEventListener('blur', onBlur, true);

    // We detect that a node is a ShadowRoot by ensuring that it is a
    // DocumentFragment and also has a host property. This check covers native
    // implementation and polyfill implementation transparently. If we only cared
    // about the native implementation, we could just check if the scope was
    // an instance of a ShadowRoot.
    if (scope.nodeType === Node.DOCUMENT_FRAGMENT_NODE && scope.host) {
      // Since a ShadowRoot is a special kind of DocumentFragment, it does not
      // have a root element to add a class to. So, we add this attribute to the
      // host element instead:
      scope.host.setAttribute('data-js-focus-visible', '');
    } else if (scope.nodeType === Node.DOCUMENT_NODE) {
      document.documentElement.classList.add('js-focus-visible');
      document.documentElement.setAttribute('data-js-focus-visible', '');
    }
  }

  // It is important to wrap all references to global window and document in
  // these checks to support server-side rendering use cases
  // @see https://github.com/WICG/focus-visible/issues/199
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Make the polyfill helper globally available. This can be used as a signal
    // to interested libraries that wish to coordinate with the polyfill for e.g.,
    // applying the polyfill to a shadow root:
    window.applyFocusVisiblePolyfill = applyFocusVisiblePolyfill;

    // Notify interested libraries of the polyfill's presence, in case the
    // polyfill was loaded lazily:
    var event;

    try {
      event = new CustomEvent('focus-visible-polyfill-ready');
    } catch (error) {
      // IE11 does not support using CustomEvent as a constructor directly:
      event = document.createEvent('CustomEvent');
      event.initCustomEvent('focus-visible-polyfill-ready', false, false, {});
    }

    window.dispatchEvent(event);
  }

  if (typeof document !== 'undefined') {
    // Apply the polyfill to the global document, so that no JavaScript
    // coordination is required to use the polyfill in the top-level document:
    applyFocusVisiblePolyfill(document);
  }

})));

/* eslint max-len: 0 */

class BurgtonButton extends LitElement {
  static get is() { return 'burgton-button'; }

  static get styles() {
    return styles;
  }

  render() {
    return html`
      <span class="line line--top"></span>
      <span class="line line--middle"></span>
      <span class="line line--bottom"></span>
      ${this.label ? html`<span class="label">${this.label}</span>` : ''}
    `;
  }

  static get properties() {
    return {
      type: { type: String },
      state: { type: Boolean },
      label: { type: String },
      labelPosition: { type: String },
      targetSelectors: { type: String },
      targetClasses: { type: String },
      description: { type: String },
    };
  }

  /**
   * Set or remove 'active' attribute according to the value of the this.state property
   * @param value
   */
  set state(value) {
    this._state = value;
    // eslint-disable-next-line no-unused-expressions
    this._state ? this.setAttribute('active', '') : this.removeAttribute('active');
    this.setAttribute('aria-pressed', this._state);
    this._toggleTargetClasses();
    this._dispatchEvent('burgton-button-state-change');
  }

  /**
   * Get correct value for the state property
   */
  get state() {
    return this._state;
  }

  /**
   * Set the button type
   * @param value
   */
  set type(value) {
    this._type = value;
    this.setAttribute('type', this._type);
  }

  /**
   * Get value of type property
   */
  get type() {
    return this._type;
  }

  /**
   * Add warning if labelPosition property has an invalid value
   */
  set labelPosition(value) {
    const acceptedPositions = ['top', 'bottom', 'right', 'left'];
    if ((value && !acceptedPositions.includes(value)) || value === '') {
      this._logError(`"${value}" is not a valid labelPosition value`);
      this.setAttribute('labelPosition', 'bottom');
      this._labelPosition = 'bottom';
    } else {
      this._labelPosition = value;
    }
  }

  /**
   * Get value of labelPosition property
   */
  get labelPosition() {
    return this._labelPosition;
  }

  set targetSelectors(value) {
    this._targetSelectors = value;
  }

  /**
   * Get value of targetSelectors property
   */
  get targetSelectors() {
    return this._targetSelectors;
  }

  /**
   * Check if not empty and set value of targetClasses property
   */
  set targetClasses(value) {
    this._targetClasses = value;
  }

  /**
   * Get value of targetClasses property
   */
  get targetClasses() {
    return this._targetClasses;
  }

  /**
   * Set the 'aria-label' attribute.
   * This attribute is used by screen readers to 'describe' the element
   */
  set description(value) {
    this._description = this.label ? this.label : value;
    this.setAttribute('aria-label', this._description);
  }

  /**
   * Get value of description property
   */
  get description() {
    return this._description;
  }

  constructor() {
    super();

    this.type = 'default';
    this.state = false;
    this.label = null;
    this.labelPosition = 'bottom';
    this.description = 'Menu button';
    this.acceptedTypes = [
      'default',
      'arrow-left',
      'arrow-right',
      'arrow-to-arrow',
      'astronaut',
      'async',
      'crossed',
      'ellipsis',
      'fall-down',
      'minus',
      'rotator',
      'spin',
      'underlined',
      'vertical-rotator',
      'zoom',
    ];

    this.addA11yFeatures();
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this._handleClick);
    this.addEventListener('keydown', this._handleKeyPressed);
  }

  // eslint-disable-next-line no-unused-vars
  attributeChangedCallback(name, old, value) {
    if (name === 'type' && !this.acceptedTypes.includes(value)) {
      this._logError(`"${value}" is not a valid type value`);
      this.type = 'default';
    } else {
      super.attributeChangedCallback(name, old, value);
    }
  }

  /**
   * To improve accessibility we need to add some attributes to the element
   * so it is seen as a 'button' also by screen readers
   */
  addA11yFeatures() {
    this.setAttribute('role', 'button');
    this.setAttribute('aria-pressed', false);
    this.tabIndex = 0;
    this.setAttribute('aria-haspopup', 'menu');
  }

  /**
   * @private
   * Handle click on the burgton-button element
   *    1. toggle state
   */
  _handleClick() {
    this.toggleState();
    this._dispatchEvent('burgton-button-click');
  }

  /**
   * Handle key press when the burgton-button is focused
   * This is a functionality of the native <button> element.
   * @param event
   * @private
   */
  _handleKeyPressed(event) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar') {
      event.preventDefault();
      this._handleClick();
    }
  }

  /**
   * @private
   * Toggle target classes on defined target elements
   */
  _toggleTargetClasses() {
    if (this._targetSelectors && this._targetClasses) {
      const targetsCollection = this.getAttribute('targetSelectors').split(',').map((item) => item.trim());
      const classesCollection = this.getAttribute('targetClasses').split(',').map((item) => item.trim());

      if (targetsCollection.length !== classesCollection.length) {
        this._logError(`The number of target selectors (${targetsCollection.length}) does not match the number of target classes (${classesCollection.length}), so to prevent errors the selector toggle will be disabled. Make sure the number of targetSelectors and targetClasses match.`);
        return;
      }
      targetsCollection.forEach((targetsElement, index) => {
        document.querySelector(targetsElement).classList.toggle(classesCollection[index]);
      });
    }
  }

  /**
   * @param eventName
   * @private
   * Dispatch custom events so other elements can react to them
   */
  _dispatchEvent(eventName) {
    const newEvent = new CustomEvent(eventName, {
      bubbles: true,
      composed: true,
      detail: {
        state: this.state,
      },
    });
    this.dispatchEvent(newEvent);
  }

  /**
   * @param error
   * @private
   * Print error on the console and show link to documentation
   */
  _logError(error) {
    console.error(`BURGTON BUTTON ERROR: ${error}`);
    // eslint-disable-next-line no-console
    console.info('You can find the documentation for the burgton button here: https://boguz.github.io/burgton-button-docs/');
  }

  /**
   * @public
   * Toggle the button state
   */
  toggleState() {
    this.state = !this.hasAttribute('active');
  }

  /**
   * @public
   * Change state to true to activate the button
   */
  activate() {
    this.state = true;
    this._dispatchEvent('burgton-button-activate');
  }

  /**
   * @public
   * Change state to false to deactivate the button
   */
  deactivate() {
    this.state = false;
    this._dispatchEvent('burgton-button-deactivate');
  }
}

customElements.define(BurgtonButton.is, BurgtonButton);

export default BurgtonButton;
//# sourceMappingURL=burgton-button-bundle.js.map
