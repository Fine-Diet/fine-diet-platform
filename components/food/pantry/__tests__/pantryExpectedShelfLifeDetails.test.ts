import { expectedShelfLifeDetailsProps } from '../pantryExpectedShelfLifeDetails';

describe('expectedShelfLifeDetailsProps', () => {
  it('leaves disclosure uncontrolled when exact expiration is present', () => {
    expect(
      expectedShelfLifeDetailsProps('2026-12-01', '14'),
    ).toEqual({});
  });

  it('opens disclosure when only expected shelf life is stored', () => {
    expect(
      expectedShelfLifeDetailsProps('', '14'),
    ).toEqual({ open: true });
  });

  it('leaves disclosure uncontrolled when neither expiration nor shelf life is set', () => {
    expect(
      expectedShelfLifeDetailsProps('', ''),
    ).toEqual({});
  });
});
