import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { notify } from '../api';
import { useAuth } from '../auth';
import Avatar from '../components/Avatar';
import { useTheme } from '../hooks';
import { cropRect, isValidPhone, isUploaded, PICTURE_SIZE, PRESETS, presetOf } from '../profileLogic';
import { setTheme, Theme, THEMES, THEME_NAMES } from '../theme';

// Little colour previews for the theme tiles: page, card, accent, chart colour.
const SWATCH: Record<Theme, [string, string, string, string]> = {
  spidey: ['#070b1c', '#0e1633', '#e62429', '#4d8dff'],
  amazing: ['#040914', '#0a1428', '#e0262d', '#38a3ff'],
  light: ['#f4f5fb', '#ffffff', '#4f46e5', '#2a78d6'],
  dark: ['#0e1016', '#181b25', '#8480ff', '#3987e5'],
};
const THEME_HINT: Record<Theme, string> = {
  spidey: 'Comic panels, webs and a dangling spider',
  amazing: 'Sleek, cinematic and moody',
  light: 'Clean and bright',
  dark: 'Easy on the eyes at night',
};

/** Centre-crops to a square, shrinks to 256px and returns a small JPEG data URL (a few dozen KB). */
async function readPicture(file: File): Promise<string> {
  if (!/^image[/](png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture');
  if (file.size > 12 * 1024 * 1024) throw new Error('That picture is too big (12 MB is the limit)');
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = cropRect(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = PICTURE_SIZE;
    canvas.height = PICTURE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("This browser can't process pictures");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const theme = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const phoneOk = isValidPhone(phone);
  const dirty = name.trim() !== user.name || (phone.trim() || null) !== user.phone || avatar !== user.avatar;
  const preset = presetOf(avatar);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phoneOk) return;
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() || null, avatar });
      notify('Profile saved 🕷️');
    } catch {
      /* the failure toast is shown by api() */
    } finally {
      setSaving(false);
    }
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still fires
    if (!file) return;
    try {
      setAvatar(await readPicture(file));
    } catch (err) {
      notify((err as Error).message || "Couldn't read that picture", 'error');
    }
  }

  return (
    <>
      <h1>Profile</h1>

      <div className="card profile-head">
        <Avatar avatar={avatar} name={name || user.name} size={92} className="avatar-lg" />
        <div className="profile-who">
          <div className="profile-name">{name.trim() || user.name}</div>
          <div className="muted">@{user.username}</div>
          <div className="muted">{phone.trim() ? `📞 ${phone.trim()}` : 'No phone number yet'}</div>
        </div>
      </div>

      <form className="card" onSubmit={save}>
        <h2>Your details</h2>
        <label className="profile-field">
          <span>Name</span>
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="profile-field">
          <span>Phone number</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            maxLength={24}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={!phoneOk}
          />
        </label>
        {!phoneOk && <div className="error" style={{ margin: '6px 0 0' }}>Enter 7–15 digits. You can use +, spaces, dashes and brackets.</div>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={!dirty || !phoneOk || !name.trim() || saving}>{saving ? 'Saving…' : 'Save profile'}</button>
          {dirty && <span className="dirty-dot">Unsaved changes</span>}
        </div>
      </form>

      <div className="card">
        <h2>Profile picture</h2>
        <div className="avatar-grid" role="radiogroup" aria-label="Profile picture">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={`avatar-choice ${preset === p.id ? 'on' : ''}`} onClick={() => setAvatar(`preset:${p.id}`)} title={p.label}>
              <Avatar avatar={`preset:${p.id}`} name={p.label} size={64} />
              <span>{p.label}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={isUploaded(avatar)} className={`avatar-choice ${isUploaded(avatar) ? 'on' : ''}`} onClick={() => fileRef.current?.click()} title="Upload your own photo">
            {isUploaded(avatar) ? <Avatar avatar={avatar} name="Your photo" size={64} /> : <span className="avatar-upload" aria-hidden>📷</span>}
            <span>{isUploaded(avatar) ? 'Change photo' : 'Upload photo'}</span>
          </button>
          <button type="button" role="radio" aria-checked={!avatar} className={`avatar-choice ${!avatar ? 'on' : ''}`} onClick={() => setAvatar(null)} title="Use my initials">
            <Avatar avatar={null} name={name || user.name} size={64} />
            <span>Initials</span>
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPick} />
        <p className="muted" style={{ margin: '12px 0 0' }}>Photos are cropped to a square and shrunk before saving. Remember to press <strong>Save profile</strong>.</p>
      </div>

      <div className="card">
        <h2>Theme</h2>
        <div className="theme-grid" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={`theme-tile ${theme === t ? 'on' : ''}`} onClick={() => setTheme(t)}>
              <span className="theme-swatch" style={{ background: SWATCH[t][0] }} aria-hidden>
                <i style={{ background: SWATCH[t][1] }} />
                <i style={{ background: SWATCH[t][2] }} />
                <i style={{ background: SWATCH[t][3] }} />
              </span>
              <strong>{THEME_NAMES[t]}</strong>
              <span className="muted">{THEME_HINT[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Account</h2>
        <div className="muted" style={{ marginBottom: 12 }}>Signed in as <strong>@{user.username}</strong></div>
        <button type="button" onClick={logout}>🚪 Log out</button>
      </div>
    </>
  );
}
