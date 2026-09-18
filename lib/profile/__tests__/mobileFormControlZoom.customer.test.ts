import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Customer-facing form mobile zoom (Pass 3)', () => {
  it('uses text-xl on LoginForm email and password inputs', () => {
    const login = read('components/account/LoginForm.tsx');
    expect(login).toContain('login-email');
    expect(login).toMatch(/id="login-email"[\s\S]{0,320}text-xl/);
    expect(login).toMatch(/id="login-password"[\s\S]{0,320}text-xl/);
  });

  it('uses text-xl on SignupForm credential inputs', () => {
    const signup = read('components/account/SignupForm.tsx');
    expect(signup).toMatch(/id="signup-email"[\s\S]{0,320}text-xl/);
    expect(signup).toMatch(/id="signup-password"[\s\S]{0,320}text-xl/);
    expect(signup).toMatch(/id="signup-confirm-password"[\s\S]{0,320}text-xl/);
  });

  it('uses text-xl on marketing email capture inputs', () => {
    const footer = read('components/footer/Footer.tsx');
    const grid = read('components/home/GridItemEmailCapture.tsx');
    expect(footer).toContain('rounded-full text-xl placeholder:text-[#252018]');
    expect(grid).toContain("py-2 text-xl text-white ' +");
  });
});
