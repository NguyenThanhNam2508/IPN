const fs = require('fs');

let css = fs.readFileSync('public/style.css', 'utf-8');

// 1. Thay đổi root variables
const newRoot = `:root {
    --bg-dark: #07070a;
    --card-bg: rgba(18, 18, 24, 0.75);
    --border: rgba(255, 255, 255, 0.05);
    --border-hover: rgba(255, 255, 255, 0.1);
    --primary: #8b5cf6;
    --primary-hover: #7c3aed;
    --primary-glow: rgba(139, 92, 246, 0.25);
    --cyan: #06b6d4;
    --cyan-glow: rgba(6, 182, 212, 0.25);
    --green: #10b981;
    --green-glow: rgba(16, 185, 129, 0.25);
    --amber: #f59e0b;
    --red: #ef4444;
    --text-main: #f8fafc;
    --text-sub: #cbd5e1;
    --text-dim: #64748b;
    --raw-accent: #0ea5e9;
    --decrypt-accent: #10b981;
    --radius: 1rem;
    --radius-sm: 0.5rem;
}`;
css = css.replace(/:root\s*\{[\s\S]*?\}/, newRoot);

// 2. Undo soft background replacements: In the light theme pass, we replaced rgba(255, 255, 255, 0.) with rgba(0, 0, 0, 0.) globally!
css = css.replace(/rgba\(0,\s*0,\s*0,\s*0\./g, 'rgba(255, 255, 255, 0.');

// 3. Fix the dark mode elements that explicitly used rgba(0, 0, 0, 0.*) before the light theme pass!
// Wait! If I blindly replace ALL rgba(0,0,0,0.*) with rgba(255,255,255,0.*), then things that were INTENTIONALLY black shadows will turn white! 
// Let's just fix the specific blocks.
css = css.replace(/\.url-display input\s*\{[^}]+\}/, `.url-display input {
    flex: 1; min-width: 0; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--text-main); border-radius: var(--radius-sm); font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; padding: 0.6rem 1rem;
}`);

css = css.replace(/\.key-row\s*\{[^}]+\}/g, `.key-row {
    display: grid; grid-template-columns: 1.25fr 2fr auto; gap: 0.75rem;
    background: rgba(0, 0, 0, 0.2); padding: 0.75rem; border-radius: var(--radius-sm);
    border: 1px dashed rgba(255, 255, 255, 0.1); align-items: flex-end;
}`);

css = css.replace(/\.key-input\s*\{[^}]+\}/, `.key-input {
    background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.12);
    color: var(--text-main); padding: 0.75rem 1rem; border-radius: var(--radius-sm);
    font-family: 'JetBrains Mono', monospace; font-size: 0.95rem; letter-spacing: 1px; transition: all 0.2s; min-width: 360px;
}`);

css = css.replace(/\.raw-packet\s*\{[^}]+\}/, `.raw-packet {
    background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(6,182,212,0.15);
    border-radius: 0.65rem; overflow: hidden;
    animation: slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    transition: border-color 0.2s;
}`);

css = css.replace(/\.decrypt-card\s*\{[^}]+\}/, `.decrypt-card {
    border: 1px solid rgba(16,185,129,0.25);
    border-radius: 0.65rem; overflow: hidden;
    animation: slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    background: rgba(255, 255, 255, 0.05);
}`);

css = css.replace(/input, select\s*\{[^}]+\}/, `input, select {
    background: rgba(0, 0, 0, 0.1); border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-main); padding: 0.7rem 1rem; border-radius: var(--radius-sm);
    font-family: inherit; font-size: 0.95rem; transition: all 0.2s;
}`);
css = css.replace(/select option\s+\{[^}]+\}/, 'select option { background: #0f0f13; }');

css = css.replace(/textarea\s*\{[^}]+\}/, `textarea {
    width: 100%; background: rgba(0, 0, 0, 0.1); border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-main); padding: 0.75rem 1rem; border-radius: var(--radius-sm);
    font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; resize: vertical; transition: all 0.2s; min-height: 80px;
}`);

// Color logic code JSON
css = css.replace(/\.json-key\s*\{[^\}]+\}/, '.json-key { color: #93c5fd; }');
css = css.replace(/\.json-str\s*\{[^\}]+\}/, '.json-str { color: #86efac; }');
css = css.replace(/\.json-num\s*\{[^\}]+\}/, '.json-num { color: #fde68a; }');
css = css.replace(/\.json-bool\s*\{[^\}]+\}/, '.json-bool { color: #c4b5fd; }');

css = css.replace(/background: rgba\(139, 92, 246, 0.08\);/, 'background: rgba(139, 92, 246, 0.12);');
css = css.replace(/background: rgba\(6, 182, 212, 0.06\);/, 'background: rgba(6, 182, 212, 0.1);');

// Some areas that originally had rgba(0,0,0,x) in Dark Mode:
// .packet-count
css = css.replace(/\.packet-count\s*\{[^}]+\}/, `.packet-count {
    font-size: 0.75rem; padding: 0.2rem 0.65rem; border-radius: 2rem;
    background: rgba(0, 0, 0,0.06); color: var(--text-dim);
    border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace;
}`);
// .btn-icon
css = css.replace(/\.btn-icon\s*\{[^}]+\}/, `.btn-icon {
    width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0,0.05); border: 1px solid var(--border); border-radius: 0.4rem;
    color: var(--text-dim); cursor: pointer; transition: all 0.2s;
}`);
// .btn-toggle-detail
css = css.replace(/\.btn-toggle-detail\s*\{[^}]+\}/, `.btn-toggle-detail {
    background: rgba(0, 0, 0,0.04); border: 1px solid var(--border); color: var(--text-dim);
    padding: 0.3rem 0.75rem; border-radius: 0.35rem; font-size: 0.75rem; cursor: pointer;
    transition: all 0.2s; margin-top: 0.5rem; font-family: inherit;
}`);
// .divider-arrow
css = css.replace(/\.divider-arrow\s*\{[^}]+\}/, `.divider-arrow {
    width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border);
    background: rgba(0, 0, 0,0.04); display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); flex-shrink: 0; animation: pulse-arrow 3s ease-in-out infinite;
}`);
// .feed-tab:hover
css = css.replace(/\.feed-tab:hover\s+\{[^}]+\}/, '.feed-tab:hover { color: var(--text-sub); background: rgba(255, 255, 255, 0.02); }');

// Specific box-shadows that should be black
css = css.replace(/box-shadow: 0 8px 32px rgba\(255, 255, 255, 0.1\)/g, 'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1)');
css = css.replace(/box-shadow: 0 8px 24px rgba\(255, 255, 255, 0.9\)/, 'box-shadow: 0 8px 24px rgba(0, 0, 0, 0.9)');
css = css.replace(/border: 1px dashed rgba\(255, 255, 255, 0.0\./, 'border: 1px dashed rgba(255, 255, 255, 0.');

fs.writeFileSync('public/style.css', css, 'utf-8');
console.log('Successfully reverted to Dark Theme styles.');
