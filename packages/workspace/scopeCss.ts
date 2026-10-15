import postcss from 'postcss';

export const scopeWorkspaceCss = (css: string): string => {
  const root = postcss.parse(css);
  const registrations: postcss.AtRule[] = [];
  root.walkAtRules('property', rule => { registrations.push(rule.clone()); rule.remove(); });
  root.walkAtRules('layer', rule => {
    rule.params = rule.params.replace(/\b(theme|base|components|utilities)\b/g, 'canva-banana-$1');
  });
  root.walkDecls(declaration => {
    declaration.value = declaration.value.replace(/(-?\d*\.?\d+)rem\b/g, 'calc(var(--canva-banana-ui-scale, 0.8) * $1rem)');
  });
  root.walkRules(rule => {
    rule.selector = rule.selector.replace(/:root|:host|\bhtml\b|\bbody\b/g, ':scope');
  });
  const scope = postcss.atRule({ name: 'scope', params: '(.canva-banana-workspace, .canva-banana-portal)' });
  scope.append(...root.nodes);
  return postcss.root({ nodes: [...registrations, scope] }).toString();
}; // Scope Tailwind's reset, tokens and utilities so importing the library cannot restyle a host page.
