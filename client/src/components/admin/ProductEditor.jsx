import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import { adminService } from '../../services/adminService';
import { formatMoney } from '../../lib/format';
import {
  AdminCard, AdminTable, ErrorNote, Field, LoadingNote, Modal,
  StatusBadge, inputClass, primaryButtonClass, selectClass, subtleButtonClass,
} from './AdminUI';

const PRODUCT_TYPES = ['digital_code', 'gift_card', 'voucher', 'software_license', 'other_digital'];
const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const emptyProduct = {
  name: '', slug: '', short_description: '', description: '', product_type: 'gift_card',
  currency_code: 'USD', status: 'draft', visibility: 'private', sort_order: 0,
  resale_rights_verified: false,
};

const emptyVariant = { variant_name: '', sku: '', denomination_value: '', status: 'active', sort_order: 0 };
const emptyPrice = { variant_id: '', amount: '', availability_mode: 'digital', stock_on_hand: 0 };
const emptyDeal = { variant_id: '', discount_type: 'percent', discount_value: '', currency_code: '', status: 'draft', starts_at: '', ends_at: '', priority: 0 };

const toLocalInput = (value) => (value ? value.slice(0, 16) : '');
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : '');

const ProductEditor = ({ productId, categories, onClose, onSaved }) => {
  const { user } = useAuth();
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ ...emptyProduct });
  const [categoryIds, setCategoryIds] = useState([]);
  const [loading, setLoading] = useState(Boolean(productId));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [variantDraft, setVariantDraft] = useState(null);
  const [priceDraft, setPriceDraft] = useState(null);
  const [dealDraft, setDealDraft] = useState(null);
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaAlt, setMediaAlt] = useState('');
  const [subError, setSubError] = useState('');

  const currentId = detail?.product?.id ?? productId ?? null;

  const load = useCallback((id) => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    setError('');
    adminService.getProductAdmin(id)
      .then((data) => {
        setDetail(data);
        setForm({ ...data.product });
        setCategoryIds(data.categoryIds);
      })
      .catch((loadError) => setError(loadError.message || 'The product could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(productId); }, [productId, load]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const saveDetails = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name?.trim()) { setError('Enter a product name.'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug || '')) { setError('Enter a URL-safe slug like "gift-card-usd".'); return; }
    if (!/^[A-Z]{3}$/.test(form.currency_code || '')) { setError('Enter a 3-letter currency code, e.g. USD.'); return; }
    setBusy(true);
    try {
      const saved = await adminService.saveProduct({ ...form, id: currentId ?? undefined }, user?.id);
      await adminService.setProductCategories(saved.id, categoryIds);
      toast.success('Product saved.');
      onSaved();
      load(saved.id);
    } catch (actionError) {
      setError(actionError.message || 'The product could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const runSub = async (action, successMessage) => {
    setSubError('');
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      load(currentId);
      onSaved();
      return true;
    } catch (actionError) {
      const message = actionError.message || 'The change could not be saved.';
      setSubError(message);
      toast.error(message);
      return false;
    }
  };

  const variants = detail?.variants ?? [];
  const prices = detail?.prices ?? [];
  const deals = detail?.deals ?? [];
  const media = detail?.media ?? [];
  const variantName = (variantId) => variants.find((variant) => variant.id === variantId)?.variant_name ?? 'Base product';

  if (loading) return <Modal title="Product" onClose={onClose} wide><LoadingNote label="Loading product…" /></Modal>;

  return (
    <Modal title={currentId ? `Edit product` : 'New product'} onClose={onClose} wide>
      <div className="space-y-6">
        {error && <ErrorNote message={error} />}

        <form onSubmit={saveDetails} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <input type="text" maxLength={180} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, slug: currentId ? current.slug : slugify(event.target.value) }))} className={inputClass} />
            </Field>
            <Field label="Slug" required hint={currentId ? 'Careful: changing a live slug breaks existing product URLs.' : undefined}>
              <input type="text" maxLength={180} value={form.slug} onChange={(event) => setField('slug', event.target.value)} className={`${inputClass} font-mono`} />
            </Field>
            <Field label="Product type" required>
              <select value={form.product_type} onChange={(event) => setField('product_type', event.target.value)} className={selectClass}>
                {PRODUCT_TYPES.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}
              </select>
            </Field>
            <Field label="Currency" required hint="Order currency for all prices of this product.">
              <input type="text" maxLength={3} value={form.currency_code} onChange={(event) => setField('currency_code', event.target.value.toUpperCase())} className={inputClass} />
            </Field>
            <Field label="Status" required>
              <select value={form.status} onChange={(event) => setField('status', event.target.value)} className={selectClass}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Visibility" required>
              <select value={form.visibility} onChange={(event) => setField('visibility', event.target.value)} className={selectClass}>
                <option value="private">Private</option>
                <option value="unlisted">Unlisted</option>
                <option value="public">Public</option>
              </select>
            </Field>
          </div>
          <Field label="Short description" hint="Shown on product cards; up to 500 characters.">
            <textarea rows={2} maxLength={500} value={form.short_description || ''} onChange={(event) => setField('short_description', event.target.value)} className={inputClass} />
          </Field>
          <Field label="Full description">
            <textarea rows={5} maxLength={12000} value={form.description || ''} onChange={(event) => setField('description', event.target.value)} className={inputClass} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sort order" hint="Lower numbers appear first in relevance ordering.">
              <input type="number" value={form.sort_order} onChange={(event) => setField('sort_order', event.target.value)} className={inputClass} />
            </Field>
            <div className="rounded-xl border border-white/[0.08] bg-black/25 p-4">
              <label className="flex items-start gap-3 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={Boolean(form.resale_rights_verified)}
                  onChange={(event) => setField('resale_rights_verified', event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-purple-500"
                />
                <span>
                  Resale rights verified
                  <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                    Confirm you hold legitimate rights to resell this digital product. The product cannot be published without this confirmation, which records your account and a timestamp.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-200">Categories</legend>
            {categories.length === 0 ? (
              <p className="text-xs text-gray-500">No categories exist yet. Create one under Categories first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const checked = categoryIds.includes(category.id);
                  return (
                    <label key={category.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition ${checked ? 'border-purple-300/40 bg-purple-500/15 text-white' : 'border-white/10 text-gray-400 hover:border-white/25'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setCategoryIds((current) => (checked ? current.filter((id) => id !== category.id) : [...current, category.id]))}
                        className="sr-only"
                      />
                      {category.name}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} className={subtleButtonClass}>Close</button>
            <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? 'Saving…' : currentId ? 'Save product' : 'Create product'}</button>
          </div>
        </form>

        {!currentId && (
          <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 text-xs leading-relaxed text-gray-400">
            Create the product first; variants, prices, deals, and media are managed afterwards.
          </p>
        )}

        {currentId && (
          <div className="space-y-5 border-t border-white/10 pt-5">
            {subError && <ErrorNote message={subError} />}

            <AdminCard
              title="Variants / denominations"
              description="Optional. Add a variant per denomination (any values you need — nothing is hardcoded). Products without variants use a single base price."
              actions={<button type="button" onClick={() => setVariantDraft({ ...emptyVariant })} className={subtleButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> Add variant</button>}
              className="!bg-black/25"
            >
              {variants.length === 0 ? <p className="text-xs text-gray-500">No variants; this product sells as a single option.</p> : (
                <AdminTable headers={['Variant', 'SKU', 'Denomination', 'Status', 'Actions']} caption="Variants">
                  {variants.map((variant) => (
                    <tr key={variant.id}>
                      <td className="px-3 py-2.5 text-gray-200">{variant.variant_name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-400">{variant.sku || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-300">{variant.denomination_value ?? '—'}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={variant.status} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setVariantDraft({ ...variant })} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                          <button type="button" onClick={() => runSub(() => adminService.deleteVariant(variant.id), 'Variant removed.')} className="rounded-lg border border-white/10 p-1.5 text-gray-400 transition hover:border-red-300/25 hover:text-red-200" aria-label={`Delete ${variant.variant_name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </AdminCard>

            <AdminCard
              title="Pricing & availability"
              description="One price per option. 'Digital inventory' options are fulfilled from imported codes; 'tracked' and 'unlimited' options are fulfilled manually after payment review."
              actions={<button type="button" onClick={() => setPriceDraft({ ...emptyPrice })} className={subtleButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> Add price</button>}
              className="!bg-black/25"
            >
              {prices.length === 0 ? <p className="text-xs text-gray-500">No prices yet — the product cannot be purchased until a price exists.</p> : (
                <AdminTable headers={['Option', 'Price', 'Availability', 'Stock', 'Actions']} caption="Prices">
                  {prices.map((price) => (
                    <tr key={price.id}>
                      <td className="px-3 py-2.5 text-gray-200">{variantName(price.variant_id)}</td>
                      <td className="px-3 py-2.5 text-white">{formatMoney(price.amount, form.currency_code)}</td>
                      <td className="px-3 py-2.5 text-gray-300">{price.availability_mode}<span className="block text-xs text-gray-500">{price.fulfillment_mode} fulfillment</span></td>
                      <td className="px-3 py-2.5 text-gray-300">{price.availability_mode === 'tracked' ? price.stock_on_hand : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setPriceDraft({ ...price, variant_id: price.variant_id ?? '' })} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                          <button type="button" onClick={() => runSub(() => adminService.deletePrice(price.id), 'Price removed.')} className="rounded-lg border border-white/10 p-1.5 text-gray-400 transition hover:border-red-300/25 hover:text-red-200" aria-label="Delete price"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </AdminCard>

            <AdminCard
              title="Deals"
              description="Time-boxed sale pricing calculated by the database. Customers always see server-derived prices."
              actions={<button type="button" onClick={() => setDealDraft({ ...emptyDeal, currency_code: form.currency_code })} className={subtleButtonClass}><Plus className="h-4 w-4" aria-hidden="true" /> Add deal</button>}
              className="!bg-black/25"
            >
              {deals.length === 0 ? <p className="text-xs text-gray-500">No deals configured.</p> : (
                <AdminTable headers={['Scope', 'Discount', 'Window', 'Status', 'Actions']} caption="Deals">
                  {deals.map((deal) => (
                    <tr key={deal.id}>
                      <td className="px-3 py-2.5 text-gray-200">{deal.variant_id ? variantName(deal.variant_id) : 'Whole product'}</td>
                      <td className="px-3 py-2.5 text-gray-300">{deal.discount_type === 'percent' ? `${deal.discount_value}%` : formatMoney(deal.discount_value, deal.currency_code)}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-400">{deal.starts_at ? new Date(deal.starts_at).toLocaleDateString() : 'now'} → {deal.ends_at ? new Date(deal.ends_at).toLocaleDateString() : 'open'}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={deal.status} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setDealDraft({ ...deal, variant_id: deal.variant_id ?? '', starts_at: deal.starts_at ?? '', ends_at: deal.ends_at ?? '' })} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/25 hover:text-white">Edit</button>
                          <button type="button" onClick={() => runSub(() => adminService.deleteDeal(deal.id), 'Deal removed.')} className="rounded-lg border border-white/10 p-1.5 text-gray-400 transition hover:border-red-300/25 hover:text-red-200" aria-label="Delete deal"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </AdminTable>
              )}
            </AdminCard>

            <AdminCard title="Media" description="Images upload to the public product-media bucket." className="!bg-black/25">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Image file">
                  <input type="file" accept="image/*" onChange={(event) => setMediaFile(event.target.files?.[0] ?? null)} className={`${inputClass} file:mr-3 file:rounded-lg file:border-0 file:bg-purple-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-purple-100`} />
                </Field>
                <Field label="Alt text" hint="Describes the image for screen readers.">
                  <input type="text" maxLength={300} value={mediaAlt} onChange={(event) => setMediaAlt(event.target.value)} className={inputClass} />
                </Field>
                <button
                  type="button"
                  disabled={!mediaFile}
                  onClick={() => runSub(async () => {
                    await adminService.uploadProductMedia(currentId, mediaFile, mediaAlt);
                    setMediaFile(null);
                    setMediaAlt('');
                  }, 'Image uploaded.')}
                  className={primaryButtonClass}
                >
                  <ImagePlus className="h-4 w-4" aria-hidden="true" /> Upload
                </button>
              </div>
              {media.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {media.map((item) => (
                    <li key={item.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {item.url ? <img src={item.url} alt={item.alt_text || ''} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="aspect-square" />}
                      <button
                        type="button"
                        onClick={() => runSub(() => adminService.deleteProductMedia(item), 'Image removed.')}
                        className="absolute right-2 top-2 rounded-lg border border-white/15 bg-black/70 p-1.5 text-gray-300 transition hover:border-red-300/40 hover:text-red-200"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        )}
      </div>

      {variantDraft && (
        <Modal title={variantDraft.id ? 'Edit variant' : 'Add variant'} onClose={() => setVariantDraft(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await runSub(() => adminService.saveVariant({ ...variantDraft, product_id: currentId }), 'Variant saved.');
              if (ok) setVariantDraft(null);
            }}
            className="space-y-4"
          >
            <Field label="Variant name" required hint='For denominations use e.g. "$40", "$500" — values are fully configurable.'>
              <input type="text" maxLength={120} required value={variantDraft.variant_name} onChange={(event) => setVariantDraft((current) => ({ ...current, variant_name: event.target.value }))} className={inputClass} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" hint="Optional unique code.">
                <input type="text" maxLength={100} value={variantDraft.sku || ''} onChange={(event) => setVariantDraft((current) => ({ ...current, sku: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Denomination value" hint="Optional numeric face value.">
                <input type="number" step="any" min="0" value={variantDraft.denomination_value ?? ''} onChange={(event) => setVariantDraft((current) => ({ ...current, denomination_value: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Status" required>
                <select value={variantDraft.status} onChange={(event) => setVariantDraft((current) => ({ ...current, status: event.target.value }))} className={selectClass}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <Field label="Sort order">
                <input type="number" value={variantDraft.sort_order} onChange={(event) => setVariantDraft((current) => ({ ...current, sort_order: event.target.value }))} className={inputClass} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVariantDraft(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" className={primaryButtonClass}>Save variant</button>
            </div>
          </form>
        </Modal>
      )}

      {priceDraft && (
        <Modal title={priceDraft.id ? 'Edit price' : 'Add price'} onClose={() => setPriceDraft(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await runSub(() => adminService.savePrice({ ...priceDraft, product_id: currentId }), 'Price saved.');
              if (ok) setPriceDraft(null);
            }}
            className="space-y-4"
          >
            <Field label="Option" required hint="Choose which variant this price belongs to.">
              <select value={priceDraft.variant_id} onChange={(event) => setPriceDraft((current) => ({ ...current, variant_id: event.target.value }))} className={selectClass}>
                <option value="">Base product (no variant)</option>
                {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.variant_name}</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Price (${form.currency_code})`} required>
                <input type="number" step="0.01" min="0.01" required value={priceDraft.amount} onChange={(event) => setPriceDraft((current) => ({ ...current, amount: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Availability" required>
                <select value={priceDraft.availability_mode} onChange={(event) => setPriceDraft((current) => ({ ...current, availability_mode: event.target.value }))} className={selectClass}>
                  <option value="digital">Digital inventory (auto-fulfilled from imported codes)</option>
                  <option value="tracked">Tracked stock (manual fulfillment)</option>
                  <option value="unlimited">Unlimited (manual fulfillment)</option>
                </select>
              </Field>
            </div>
            {priceDraft.availability_mode === 'tracked' && (
              <Field label="Stock on hand" required>
                <input type="number" min="0" value={priceDraft.stock_on_hand ?? 0} onChange={(event) => setPriceDraft((current) => ({ ...current, stock_on_hand: event.target.value }))} className={inputClass} />
              </Field>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPriceDraft(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" className={primaryButtonClass}>Save price</button>
            </div>
          </form>
        </Modal>
      )}

      {dealDraft && (
        <Modal title={dealDraft.id ? 'Edit deal' : 'Add deal'} onClose={() => setDealDraft(null)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await runSub(() => adminService.saveDeal({ ...dealDraft, product_id: currentId }), 'Deal saved.');
              if (ok) setDealDraft(null);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Scope" required>
                <select value={dealDraft.variant_id} onChange={(event) => setDealDraft((current) => ({ ...current, variant_id: event.target.value }))} className={selectClass}>
                  <option value="">Whole product</option>
                  {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.variant_name}</option>)}
                </select>
              </Field>
              <Field label="Discount type" required>
                <select value={dealDraft.discount_type} onChange={(event) => setDealDraft((current) => ({ ...current, discount_type: event.target.value }))} className={selectClass}>
                  <option value="percent">Percent off</option>
                  <option value="amount">Amount off</option>
                </select>
              </Field>
              <Field label={dealDraft.discount_type === 'percent' ? 'Percent (1–100)' : `Amount (${form.currency_code})`} required>
                <input type="number" step="any" min="0" required value={dealDraft.discount_value} onChange={(event) => setDealDraft((current) => ({ ...current, discount_value: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Status" required>
                <select value={dealDraft.status} onChange={(event) => setDealDraft((current) => ({ ...current, status: event.target.value }))} className={selectClass}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Field label="Starts" hint="Optional">
                <input type="datetime-local" value={toLocalInput(dealDraft.starts_at)} onChange={(event) => setDealDraft((current) => ({ ...current, starts_at: fromLocalInput(event.target.value) }))} className={inputClass} />
              </Field>
              <Field label="Ends" hint="Optional">
                <input type="datetime-local" value={toLocalInput(dealDraft.ends_at)} onChange={(event) => setDealDraft((current) => ({ ...current, ends_at: fromLocalInput(event.target.value) }))} className={inputClass} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDealDraft(null)} className={subtleButtonClass}>Cancel</button>
              <button type="submit" className={primaryButtonClass}>Save deal</button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
};

export default ProductEditor;
