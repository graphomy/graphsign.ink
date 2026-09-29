import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignatureModal } from './SignatureModal';

describe('SignatureModal Component Tests (INK-100, INK-101, INK-102)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('switches between Draw, Type, and Upload tabs', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SignatureModal
        isOpen={true}
        fieldType="SIGNATURE"
        defaultSignerName="John Doe"
        onSave={onSave}
        onClose={onClose}
      />,
    );

    // Initial tab is Draw
    expect(screen.getByTestId('signature-canvas')).toBeDefined();

    // Switch to Type Tab
    fireEvent.click(screen.getByTestId('tab-type-signature'));
    expect(screen.getByTestId('typed-signature-input')).toBeDefined();
    expect(screen.getByText('Dancing Script')).toBeDefined();

    // Switch to Upload Tab
    fireEvent.click(screen.getByTestId('tab-upload-signature'));
    expect(screen.getByTestId('signature-dropzone')).toBeDefined();
  });

  it('allows adopting typed signature with selected handwriting font (INK-101)', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <SignatureModal
        isOpen={true}
        fieldType="SIGNATURE"
        defaultSignerName="Jane Doe"
        onSave={onSave}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId('tab-type-signature'));

    const input = screen.getByTestId('typed-signature-input');
    fireEvent.change(input, { target: { value: 'Jane Legal' } });

    // Select Caveat font
    const caveatFontBtn = screen.getByTestId('font-choice-caveat');
    fireEvent.click(caveatFontBtn);

    const adoptBtn = screen.getByTestId('adopt-signature-button');
    fireEvent.click(adoptBtn);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TYPED',
        rawText: 'Jane Legal',
        fontFamily: 'Caveat',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
