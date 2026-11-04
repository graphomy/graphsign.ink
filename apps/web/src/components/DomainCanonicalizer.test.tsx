import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { DomainCanonicalizer } from './DomainCanonicalizer';

describe('DomainCanonicalizer Component', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  function setWindowLocation(mockProps: Partial<Location>) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        ...mockProps,
      },
    });
  }

  it('does not redirect on custom domain graphsign.ink', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: 'graphsign.ink',
      pathname: '/dashboard',
      search: '?tab=active',
      hash: '',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not redirect on localhost', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: 'localhost',
      pathname: '/login',
      search: '',
      hash: '',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not redirect on development domain dev-graphsign-web.pages.dev', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: 'dev-graphsign-web.pages.dev',
      pathname: '/agreements',
      search: '?status=DRAFT',
      hash: '#section1',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('does not redirect on dev.graphsign.ink or dev preview deployment', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: '1234abcd.dev-graphsign-web.pages.dev',
      pathname: '/sign/GS-12345',
      search: '',
      hash: '',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects production graphsign-web.pages.dev to graphsign.ink', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: 'graphsign-web.pages.dev',
      pathname: '/',
      search: '',
      hash: '',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).toHaveBeenCalledWith('https://graphsign.ink/');
  });

  it('redirects production branch preview to graphsign.ink preserving path, query, and hash', () => {
    const replaceMock = vi.fn();
    setWindowLocation({
      hostname: 'deploy-preview-1.graphsign-web.pages.dev',
      pathname: '/agreements',
      search: '?status=DRAFT',
      hash: '#section1',
      replace: replaceMock as unknown as Location['replace'],
    });

    render(<DomainCanonicalizer />);
    expect(replaceMock).toHaveBeenCalledWith(
      'https://graphsign.ink/agreements?status=DRAFT#section1',
    );
  });
});
