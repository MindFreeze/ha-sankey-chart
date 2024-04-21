//mock custom-card-helpers
jest.mock('custom-card-helpers', () => ({
  ...jest.requireActual('custom-card-helpers'),
  stateIcon: jest.fn().mockReturnValue('state-icon'),
}));