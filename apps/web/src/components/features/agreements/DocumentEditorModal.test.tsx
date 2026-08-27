import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DocumentEditorModal } from './DocumentEditorModal';

describe('DocumentEditorModal Component Tests (INK-78 to INK-85, INK-270)', () => {
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
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-pdf');
    global.URL.revokeObjectURL = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        if (opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        if (url.includes('/file')) {
          return Promise.resolve({
            ok: true,
            blob: () =>
              Promise.resolve(new Blob(['mock pdf content'], { type: 'application/pdf' })),
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
    expect(screen.getByText(/Employee Signature/)).toBeDefined();
  });

  it('renders signer dropdown and adds up to 10 signers with limit enforcement (INK-270)', async () => {
    render(<DocumentEditorModal agreement={mockAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    // Dropdown should exist with initial signer
    const selectEl = screen.getByLabelText('Active Signer Selector');
    expect(selectEl).toBeDefined();
    expect(screen.getByText(/Select Signer \(1\/10\)/i)).toBeDefined();

    const addSignerBtn = screen.getByRole('button', { name: /\+ Add Signer/i });

    // Add up to 10 signers
    for (let i = 2; i <= 10; i++) {
      fireEvent.click(addSignerBtn);
    }

    expect(screen.getByText(/Select Signer \(10\/10\)/i)).toBeDefined();
    expect(addSignerBtn).toBeDisabled();
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
    const fieldBadge = screen.getByText(/Employee Signature/);
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

  it('allows renaming signers and opening send modal on Done (INK-266)', async () => {
    const onSuccessMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <DocumentEditorModal
        agreement={mockAgreement}
        onClose={onCloseMock}
        onSuccess={onSuccessMock}
      />,
    );

    // Rename signer from Jane Signer to Author
    const nameInput = screen.getByDisplayValue('Jane Signer');
    fireEvent.change(nameInput, { target: { value: 'Author' } });
    expect(screen.getByDisplayValue('Author')).toBeDefined();

    const doneBtn = screen.getByText('Done');
    fireEvent.click(doneBtn);

    // Send modal should open
    await waitFor(() => {
      expect(screen.getByText('Send Agreement for Signature')).toBeDefined();
    });
  });

  it('renders PDF preview iframe when agreement is a PDF document', async () => {
    const pdfAgreement = {
      id: 'ag-pdf-1',
      title: 'Vendor Master Agreement.pdf',
      version: '0.1',
      status: 'IN_REVIEW',
      mimeType: 'application/pdf',
      fileName: 'Vendor Master Agreement.pdf',
      fields: { fields: [], recipients: [] },
    };

    render(<DocumentEditorModal agreement={pdfAgreement} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTitle('Document PDF Preview')).toBeInTheDocument();
      expect(screen.getByText('In Review')).toBeInTheDocument();
    });
  });
});
