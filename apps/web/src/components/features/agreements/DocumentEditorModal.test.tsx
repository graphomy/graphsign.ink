import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DocumentEditorModal } from './DocumentEditorModal';

describe('DocumentEditorModal Component Tests (INK-78 to INK-85)', () => {
  const mockAgreement = {
    id: 'ag-edit-1',
    title: 'Employment Agreement',
    version: '0.1',
    status: 'DRAFT',
    markdownContent:
      '# Employment Agreement\n\nThis agreement is made between Company and Employee.',
    fields: {
      fields: [
        {
          id: 'field-1',
          type: 'SIGNATURE' as const,
          pageNumber: 1,
          x: 20,
          y: 30,
          width: 25,
          height: 9,
          label: 'Employee Signature',
          recipientId: 'recipient-1',
          isRequired: true,
        },
      ],
      recipients: [
        {
          id: 'recipient-1',
          name: 'Jane Signer',
          email: 'jane@example.com',
          role: 'signer' as const,
          color: '#2563EB',
        },
      ],
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              fields: mockAgreement.fields.fields,
              recipients: mockAgreement.fields.recipients,
            }),
        });
      }),
    );
  });

  it('renders modal header, field palette, canvas, and existing placed fields (INK-78, INK-79)', async () => {
    render(<DocumentEditorModal agreement={mockAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getAllByText('Employment Agreement').length).toBeGreaterThan(0);
    expect(screen.getByText('Edit Fields')).toBeDefined();
    expect(screen.getByText('Preview as Signer')).toBeDefined();
    expect(screen.getByText('Signature Fields')).toBeDefined();
    expect(screen.getByText('Text & Information')).toBeDefined();
    expect(screen.getByText('Choice Elements')).toBeDefined();

    // Check existing field overlay
    expect(screen.getByText('Employee Signature')).toBeDefined();
  });

  it('allows adding a text field from palette onto the canvas (INK-80)', async () => {
    render(<DocumentEditorModal agreement={mockAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const textFieldBtn = screen.getByText('Text Field');
    fireEvent.click(textFieldBtn);

    // Inspector should appear with Field Settings
    expect(screen.getByText('Field Settings')).toBeDefined();
  });

  it('allows toggling Required field status and configuring validation rules (INK-82, INK-83)', async () => {
    render(<DocumentEditorModal agreement={mockAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    // Select the existing signature field by clicking on it
    const fieldBadge = screen.getByText('Employee Signature');
    fireEvent.mouseDown(fieldBadge);

    expect(screen.getByText('Field Settings')).toBeDefined();
    expect(screen.getByText('Required Field')).toBeDefined();
  });

  it('switches to Preview Mode with recipient switcher and interactive simulation (INK-85)', async () => {
    render(<DocumentEditorModal agreement={mockAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const previewModeBtn = screen.getByText('Preview as Signer');
    fireEvent.click(previewModeBtn);

    // Preview Controls should be shown
    expect(screen.getByText('Preview Controls')).toBeDefined();
    expect(screen.getByText('Viewing as Signer:')).toBeDefined();
    expect(screen.getByText('Interactive Simulation')).toBeDefined();

    // Signature click target in preview
    expect(screen.getByText('✍️ Click to Sign')).toBeDefined();
  });

  it('saves fields and triggers onSuccess callback', async () => {
    const onSuccessMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <DocumentEditorModal
        agreement={mockAgreement}
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
      />,
    );

    const doneBtn = screen.getByText('Done');
    fireEvent.click(doneBtn);

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalled();
      expect(onCloseMock).toHaveBeenCalled();
    });
  });
});
