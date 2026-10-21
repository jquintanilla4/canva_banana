import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import { scopeWorkspaceCss } from '../../scopeCss';

describe('distributed workspace CSS', () => {
  it('scopes reset, tokens and utilities while retaining global property registrations', () => {
    const result = postcss.parse(scopeWorkspaceCss('@property --tw-x { syntax: "*"; inherits: false; } @layer theme, base, utilities; @layer theme { :root, :host { --color-red: red; } } @layer base { html { margin: 0 } } .flex { display: flex; }'));
    expect(result.nodes.map(node => node.type === 'atrule' ? node.name : node.type)).toEqual(['property', 'scope']);
    expect(result.toString()).toContain('canva-banana-utilities');
    expect(result.toString()).toContain(':scope');
    expect(result.toString()).not.toContain(':root');
  });
});
