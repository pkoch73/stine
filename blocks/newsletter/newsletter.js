import { readBlockConfig } from '../../scripts/aem.js';

/**
 * loads and decorates the newsletter sign-up
 *
 * Authored as key/value rows — Text, Label, Placeholder, Submit, Action, Success — so
 * every field is optional and order does not matter. Without an Action the form only
 * acknowledges the submission, which is what the draft pages use.
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const config = readBlockConfig(block);
  const id = `newsletter-email-${Math.random().toString(36).slice(2, 8)}`;

  const copy = document.createElement('p');
  copy.className = 'newsletter-copy';
  copy.textContent = config.text || 'Letters from Oslo, once a month.';

  const label = document.createElement('label');
  label.className = 'newsletter-label';
  label.htmlFor = id;
  label.textContent = config.label || 'Email address';

  const input = document.createElement('input');
  input.type = 'email';
  input.id = id;
  input.name = 'email';
  input.required = true;
  input.autocomplete = 'email';
  input.placeholder = config.placeholder || 'your@email.com';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'newsletter-submit';
  submit.textContent = config.submit || 'Subscribe';

  const status = document.createElement('p');
  status.className = 'newsletter-status';
  status.setAttribute('role', 'status');

  const field = document.createElement('div');
  field.className = 'newsletter-field';
  field.append(input, submit);

  const form = document.createElement('form');
  form.className = 'newsletter-form';
  form.method = 'post';
  if (config.action) form.action = config.action;
  form.append(label, field);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    try {
      if (config.action) {
        const response = await fetch(config.action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: input.value }),
        });
        if (!response.ok) throw new Error(`Sign-up failed: ${response.status}`);
      }
      status.textContent = config.success || 'Thanks — see you next month.';
      form.hidden = true;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Newsletter sign-up failed', error);
      status.textContent = 'Something went wrong. Please try again.';
      submit.disabled = false;
    }
  });

  block.replaceChildren(copy, form, status);
}
