/**
 * Device Tags Manager (/helpdesk/tags, IT-only)
 * Fleet taxonomy console: KPI ribbon, tag cards with colour orb + sample
 * DeviceGlyphs, create/edit modal (supports `?newtag=1` from `C` hotkey),
 * delete with Undo banner calling `restoreTag`, and interactive bulk tagger.
 */
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Check,
  Hash,
  Laptop,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import {
  Chip,
  CountUp,
  NeoBanner,
  NeoBanners,
  NeoEmpty,
  NeoHead,
  NeoKpi,
  NeoKpis,
  NeoPanel,
  NeoSearch,
  NeoStage,
} from '@/components/neo';
import { Modal } from '@/components/ui/Modal';
import { useNow } from '@/hooks/useNow';
import { toast } from '@/store/toast';
import { useHub } from '@/store/hub';
import { normaliseTagName, useHelpdesk, type TagSnapshot } from '@/helpdesk/store';
import type { DeviceTag, Office } from '@/helpdesk/types';
import { DEVICE_STATUS_LABEL, KIND_LABEL, OFFICES } from '@/helpdesk/meta';
import { deviceHealth } from '@/helpdesk/fleet';
import { DeviceGlyph } from './glyphs';
import { Kbd, plural, TagChip, useViewer, type HdViewer } from './ui';
import '@/styles/helpdesk/tags.css';

const TAG_SWATCHES = [
  '#22d3ee',
  '#34d399',
  '#38bdf8',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#fb923c',
  '#fb7185',
  '#a3e635',
  '#94a3b8',
];

type ScopeFilter = 'tagged' | 'untagged' | 'all';

export function TagsView(_props?: { admin?: boolean; onClose?: () => void }) {
  const viewer = useViewer();
  const tags = useHelpdesk((s) => s.tags);
  const devices = useHelpdesk((s) => s.devices);
  const users = useHub((s) => s.users);
  const now = useNow(60_000);
  const [sp, setSp] = useSearchParams();

  const [selectedTagId, setSelectedTagId] = useState<string>(() => tags[0]?.id ?? '');
  const [editingTag, setEditingTag] = useState<DeviceTag | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<TagSnapshot | null>(null);

  // Device manager filters & multi-select
  const [devQ, setDevQ] = useState('');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [officeFilter, setOfficeFilter] = useState<Office | ''>('');
  const [checkedDevs, setCheckedDevs] = useState<Set<string>>(() => new Set());

  const createOpen = sp.get('newtag') === '1';

  const openCreateModal = () => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('newtag', '1');
        return next;
      },
      { replace: true },
    );
  };

  const closeCreateModal = () => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('newtag');
        return next;
      },
      { replace: true },
    );
  };

  // Ensure selectedTagId stays valid when tags are added/removed
  useEffect(() => {
    if (!tags.some((t) => t.id === selectedTagId)) {
      setSelectedTagId(tags[0]?.id ?? '');
    }
  }, [tags, selectedTagId]);

  const activeTag = useMemo(() => tags.find((t) => t.id === selectedTagId) ?? tags[0], [tags, selectedTagId]);

  const devicesByTag = useMemo(() => {
    const map = new Map<string, typeof devices>();
    for (const t of tags) map.set(t.id, []);
    for (const d of devices) {
      for (const tid of d.tags) {
        const list = map.get(tid);
        if (list) list.push(d);
      }
    }
    return map;
  }, [tags, devices]);

  const kpis = useMemo(() => {
    const taggedCount = devices.filter((d) => d.tags.length > 0).length;
    const untaggedCount = devices.length - taggedCount;
    const sorted = [...tags].sort((a, b) => (devicesByTag.get(b.id)?.length ?? 0) - (devicesByTag.get(a.id)?.length ?? 0));
    const topTag = sorted[0];
    const topCount = topTag ? (devicesByTag.get(topTag.id)?.length ?? 0) : 0;
    return {
      totalTags: tags.length,
      taggedCount,
      taggedPct: devices.length ? Math.round((taggedCount / devices.length) * 100) : 0,
      untaggedCount,
      topTag,
      topCount,
    };
  }, [tags, devices, devicesByTag]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filteredDevices = useMemo(() => {
    if (!activeTag) return [];
    const q = devQ.trim().toLowerCase();
    return devices.filter((d) => {
      const has = d.tags.includes(activeTag.id);
      if (scope === 'tagged' && !has) return false;
      if (scope === 'untagged' && has) return false;
      if (officeFilter && d.office !== officeFilter) return false;
      if (q) {
        const owner = d.assigneeId ? (userById.get(d.assigneeId)?.name ?? '') : '';
        const hay = `${d.assetTag} ${d.model} ${d.manufacturer} ${d.kind} ${d.office} ${owner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devices, activeTag, devQ, scope, officeFilter, userById]);

  const selectTagCard = (id: string) => {
    setSelectedTagId(id);
    setCheckedDevs(new Set());
  };

  const handleDeleteTag = (tag: DeviceTag) => {
    const r = useHelpdesk.getState().deleteTag(tag.id, viewer);
    if (!r.ok) return toast.error(r.error);
    setUndoSnapshot(r.snapshot);
    toast.info(`Deleted #${tag.name}`, `Removed from ${plural(r.snapshot.deviceTags.length, 'device')} — use Undo to restore.`);
  };

  const handleUndoDelete = () => {
    if (!undoSnapshot) return;
    const r = useHelpdesk.getState().restoreTag(undoSnapshot, viewer);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Restored #${undoSnapshot.tag.name}`, `Re-attached to ${plural(undoSnapshot.deviceTags.length, 'device')}.`);
    setSelectedTagId(undoSnapshot.tag.id);
    setUndoSnapshot(null);
  };

  const toggleCheckDevice = (assetTag: string) => {
    setCheckedDevs((prev) => {
      const next = new Set(prev);
      if (next.has(assetTag)) next.delete(assetTag);
      else next.add(assetTag);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const allTags = filteredDevices.map((d) => d.assetTag);
    const allSelected = allTags.length > 0 && allTags.every((t) => checkedDevs.has(t));
    if (allSelected) {
      setCheckedDevs(new Set());
    } else {
      setCheckedDevs(new Set(allTags));
    }
  };

  const runBulkTag = (on: boolean, targetTags?: string[]) => {
    if (!activeTag) return;
    const list = targetTags ?? [...checkedDevs];
    if (!list.length) return toast.info('Tick one or more devices first.');
    const r = useHelpdesk.getState().bulkTag(list, activeTag.id, on, viewer);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      on ? `Applied #${activeTag.name}` : `Removed #${activeTag.name}`,
      r.count ? `Updated ${plural(r.count, 'device')}.` : 'All selected devices already matched.',
    );
    if (!targetTags) setCheckedDevs(new Set());
  };

  return (
    <NeoStage label="Device tags">
      <NeoHead
        icon={<Tags />}
        eyebrow="IT console · Taxonomy"
        title="Device tags"
        sub={`Organise the ${devices.length}-device fleet by profile, refresh cohort and support tier.`}
        actions={
          <>
            <Link to="/helpdesk/fleet" className="neo-btn neo-btn--soft" data-qa="tags-fleet-link">
              <Laptop /> <span className="neo-btn__label">Fleet radar</span>
            </Link>
            <button
              type="button"
              className="neo-btn neo-btn--plasma"
              onClick={openCreateModal}
              data-tip="New tag (C)"
              data-qa="tags-new"
            >
              <Plus /> <span className="neo-btn__label">New tag</span>
            </button>
          </>
        }
      />

      <div className="neo-body neo-pad">
        {undoSnapshot && (
          <NeoBanners>
            <NeoBanner
              tone="amber"
              icon={<RotateCcw />}
              title={`Deleted #${undoSnapshot.tag.name}`}
              meta={`Removed from ${plural(undoSnapshot.deviceTags.length, 'device')}`}
              action={
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="neo-btn neo-btn--plasma neo-btn--xs"
                    onClick={handleUndoDelete}
                    data-qa="tags-undo"
                  >
                    <RotateCcw /> Undo
                  </button>
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => setUndoSnapshot(null)}
                    aria-label="Dismiss undo banner"
                  >
                    <X />
                  </button>
                </div>
              }
            >
              Restore the tag and re-apply it to its {plural(undoSnapshot.deviceTags.length, 'device')}.
            </NeoBanner>
          </NeoBanners>
        )}

        <NeoKpis label="Tag taxonomy metrics">
          <NeoKpi
            label="Total tags"
            icon={<Tags />}
            value={<CountUp value={kpis.totalTags} />}
            sub="Active fleet taxonomy labels"
          />
          <NeoKpi
            label="Tagged devices"
            icon={<Check />}
            tone="emerald"
            value={<CountUp value={kpis.taggedCount} />}
            sub={`${kpis.taggedPct}% of ${devices.length} fleet assets`}
            onClick={() => setScope('tagged')}
            title="Show tagged devices"
          />
          <NeoKpi
            label="Untagged devices"
            icon={<Layers />}
            tone={kpis.untaggedCount > 0 ? 'amber' : 'emerald'}
            value={<CountUp value={kpis.untaggedCount} />}
            sub={kpis.untaggedCount ? 'Click to filter untagged' : 'Every device is tagged'}
            onClick={() => setScope('untagged')}
            title="Show devices without the selected tag"
          />
          <NeoKpi
            label="Most-used tag"
            icon={<Hash />}
            value={kpis.topTag ? `#${kpis.topTag.name}` : '—'}
            sub={kpis.topTag ? `${plural(kpis.topCount, 'device')} assigned` : 'Create a tag'}
            onClick={() => kpis.topTag && selectTagCard(kpis.topTag.id)}
          />
        </NeoKpis>

        <div className="hd-tags-layout">
          {/* Left: Tag Cards Grid */}
          <div className="hd-tags-main">
            <NeoPanel
              hud="Taxonomy catalogue"
              title={`All tags (${tags.length})`}
              icon={<Tag />}
              actions={
                <span className="neo-faint text-sm hd-tags-hint">
                  Click a card to manage its devices · <Kbd>C</Kbd> new tag
                </span>
              }
            >
              {tags.length === 0 ? (
                <NeoEmpty
                  icon={<Tags />}
                  title="No device tags yet"
                  action={
                    <button type="button" className="neo-btn neo-btn--plasma" onClick={openCreateModal}>
                      <Plus /> Create first tag
                    </button>
                  }
                >
                  Create tags like #eng-heavy, #loaner-pool or #refresh-2027 to group devices.
                </NeoEmpty>
              ) : (
                <div className="hd-tags-grid neo-stagger">
                  {tags.map((tag, i) => {
                    const tagged = devicesByTag.get(tag.id) ?? [];
                    const avgHealth = tagged.length
                      ? Math.round(tagged.reduce((s, d) => s + deviceHealth(d, now), 0) / tagged.length)
                      : 100;
                    const active = activeTag?.id === tag.id;
                    return (
                      <div
                        key={tag.id}
                        role="button"
                        tabIndex={0}
                        className="hd-tags-card neo-spot"
                        data-active={active ? 'true' : undefined}
                        style={{ '--tag-c': tag.color, '--i': i } as CSSProperties}
                        onClick={() => selectTagCard(tag.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectTagCard(tag.id);
                          }
                        }}
                        data-qa={`tag-card-${tag.id}`}
                      >
                        <div className="hd-tags-card__top">
                          <span className="hd-tags-card__pill">
                            <i className="hd-tags-card__orb" />#{tag.name}
                          </span>
                          <div className="hd-tags-card__actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="neo-iconbtn neo-iconbtn--sm"
                              aria-label={`Edit #${tag.name}`}
                              title="Edit tag"
                              onClick={() => setEditingTag(tag)}
                              data-qa={`tag-edit-${tag.id}`}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="neo-iconbtn neo-iconbtn--sm"
                              aria-label={`Delete #${tag.name}`}
                              title="Delete tag"
                              onClick={() => handleDeleteTag(tag)}
                              data-qa={`tag-delete-${tag.id}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <p className="hd-tags-card__desc">{tag.description || 'No description provided.'}</p>

                        <div className="hd-tags-card__holos" aria-label={`Sample devices with #${tag.name}`}>
                          {tagged.length === 0 ? (
                            <span className="text-xs neo-faint">No devices assigned yet</span>
                          ) : (
                            <>
                              {tagged.slice(0, 4).map((d) => (
                                <span
                                  key={d.assetTag}
                                  className="hd-tags-card__holo"
                                  title={`${d.assetTag} · ${d.model}`}
                                >
                                  <DeviceGlyph kind={d.kind} size={34} color={tag.color} />
                                </span>
                              ))}
                              {tagged.length > 4 && (
                                <span className="hd-tags-card__more">+{tagged.length - 4} more</span>
                              )}
                            </>
                          )}
                        </div>

                        <div className="hd-tags-card__foot">
                          <span className="hd-tags-card__count">{plural(tagged.length, 'device')}</span>
                          <span>{tagged.length ? `Avg health ${avgHealth}%` : 'Click to assign'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </NeoPanel>
          </div>

          {/* Right: Interactive Device Tag Assignment & Bulk Manager */}
          <aside className="hd-tags-side" aria-label="Manage devices for selected tag">
            {activeTag && (
              <NeoPanel
                hud="Bulk assignment"
                title={`Manage #${activeTag.name}`}
                actions={
                  <button
                    type="button"
                    className="neo-btn neo-btn--ghost neo-btn--xs"
                    onClick={() => setEditingTag(activeTag)}
                  >
                    <Pencil /> Edit tag
                  </button>
                }
              >
                <div className="hd-tags-mgr" style={{ '--tag-c': activeTag.color } as CSSProperties}>
                  <div className="hd-tags-mgr__head">
                    <div>
                      <div className="hd-tags-mgr__title">
                        <TagChip tag={activeTag} />
                        <span className="neo-mono text-xs neo-faint">
                          {plural(devicesByTag.get(activeTag.id)?.length ?? 0, 'device')}
                        </span>
                      </div>
                      <div className="text-xs neo-faint" style={{ marginTop: 4 }}>
                        {activeTag.description}
                      </div>
                    </div>
                  </div>

                  <div className="hd-tags-mgr__controls">
                    <NeoSearch
                      value={devQ}
                      onChange={setDevQ}
                      placeholder={`Search devices to apply or remove #${activeTag.name}…`}
                      size="sm"
                    />
                    <div className="hd-tags-mgr__filters">
                      <Chip
                        size="sm"
                        tone={scope === 'all' ? 'app' : 'slate'}
                        pressed={scope === 'all'}
                        onClick={() => setScope('all')}
                      >
                        All ({devices.length})
                      </Chip>
                      <Chip
                        size="sm"
                        tone={scope === 'tagged' ? 'emerald' : 'slate'}
                        pressed={scope === 'tagged'}
                        onClick={() => setScope('tagged')}
                      >
                        Has #{activeTag.name} ({devicesByTag.get(activeTag.id)?.length ?? 0})
                      </Chip>
                      <Chip
                        size="sm"
                        tone={scope === 'untagged' ? 'amber' : 'slate'}
                        pressed={scope === 'untagged'}
                        onClick={() => setScope('untagged')}
                      >
                        Without tag ({devices.length - (devicesByTag.get(activeTag.id)?.length ?? 0)})
                      </Chip>
                      <select
                        className="neo-select neo-select--sm"
                        style={{ width: 'auto', marginLeft: 'auto' }}
                        value={officeFilter}
                        onChange={(e) => setOfficeFilter((e.target.value as Office) || '')}
                        aria-label="Filter by office"
                      >
                        <option value="">All offices</option>
                        {OFFICES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Bulk Action Bar */}
                  <div className="hd-tags-bulk">
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className="neo-check"
                        checked={filteredDevices.length > 0 && filteredDevices.every((d) => checkedDevs.has(d.assetTag))}
                        onChange={toggleAllVisible}
                        aria-label="Select all shown devices"
                      />
                      <span>
                        {checkedDevs.size > 0
                          ? `${plural(checkedDevs.size, 'device')} selected`
                          : `Select from ${filteredDevices.length} shown`}
                      </span>
                    </label>
                    <div className="hd-tags-bulk__btns">
                      <button
                        type="button"
                        className="neo-btn neo-btn--plasma neo-btn--xs"
                        disabled={checkedDevs.size === 0}
                        onClick={() => runBulkTag(true)}
                        data-qa="tags-bulk-apply"
                      >
                        <Plus /> Apply #{activeTag.name}
                      </button>
                      <button
                        type="button"
                        className="neo-btn neo-btn--soft neo-btn--xs"
                        disabled={checkedDevs.size === 0}
                        onClick={() => runBulkTag(false)}
                        data-qa="tags-bulk-remove"
                      >
                        <X /> Remove
                      </button>
                    </div>
                  </div>

                  {/* Device rows */}
                  <div className="hd-tags-devs" role="list" aria-label={`Devices for #${activeTag.name}`}>
                    {filteredDevices.length === 0 ? (
                      <NeoEmpty compact icon={<Laptop />} title="No matching devices">
                        Try clearing the search or switching the filter chip above.
                      </NeoEmpty>
                    ) : (
                      filteredDevices.map((d) => {
                        const hasTag = d.tags.includes(activeTag.id);
                        const owner = d.assigneeId ? userById.get(d.assigneeId) : undefined;
                        return (
                          <div
                            key={d.assetTag}
                            role="listitem"
                            className="hd-tags-dev"
                            data-tagged={hasTag ? 'true' : undefined}
                            data-qa={`tag-dev-${d.assetTag}`}
                          >
                            <input
                              type="checkbox"
                              className="neo-check"
                              checked={checkedDevs.has(d.assetTag)}
                              onChange={() => toggleCheckDevice(d.assetTag)}
                              aria-label={`Select ${d.assetTag}`}
                            />
                            <DeviceGlyph kind={d.kind} size={38} color={hasTag ? activeTag.color : undefined} />
                            <div className="hd-tags-dev__info">
                              <div className="hd-tags-dev__model">
                                <Link to={`/helpdesk/fleet/${d.assetTag}`} className="neo-mono text-xs" style={{ marginRight: 6 }}>
                                  {d.assetTag}
                                </Link>
                                {d.model}
                              </div>
                              <div className="hd-tags-dev__meta">
                                <span>{KIND_LABEL[d.kind]}</span>
                                <span>·</span>
                                <span>{d.office}</span>
                                <span>·</span>
                                <span>{owner ? owner.name : DEVICE_STATUS_LABEL[d.status]}</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className={hasTag ? 'neo-btn neo-btn--soft neo-btn--xs' : 'neo-btn neo-btn--ghost neo-btn--xs'}
                              onClick={() => runBulkTag(!hasTag, [d.assetTag])}
                              title={hasTag ? `Remove #${activeTag.name} from ${d.assetTag}` : `Apply #${activeTag.name} to ${d.assetTag}`}
                              data-qa={`tag-toggle-${d.assetTag}`}
                            >
                              {hasTag ? <Check size={13} /> : <Plus size={13} />}
                              {hasTag ? 'Tagged' : 'Add'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </NeoPanel>
            )}
          </aside>
        </div>
      </div>

      {/* Create / Edit Tag Modal */}
      <TagFormModal
        open={createOpen || !!editingTag}
        initial={editingTag}
        viewer={viewer}
        onClose={() => {
          if (createOpen) closeCreateModal();
          setEditingTag(null);
        }}
        onCreated={(t) => setSelectedTagId(t.id)}
      />
    </NeoStage>
  );
}

/* ==========================================================================
   Create / Edit Tag Modal
   ========================================================================== */

function TagFormModal({
  open,
  initial,
  viewer,
  onClose,
  onCreated,
}: {
  open: boolean;
  initial: DeviceTag | null;
  viewer: HdViewer | null;
  onClose: () => void;
  onCreated: (tag: DeviceTag) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_SWATCHES[0]);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setColor(initial.color);
      setDescription(initial.description);
    } else if (open) {
      setName('');
      setColor(TAG_SWATCHES[0]);
      setDescription('');
    }
  }, [initial, open]);

  const slug = normaliseTagName(name) || 'new-tag';
  const previewTag: DeviceTag = {
    id: slug,
    name: slug,
    color,
    description: description.trim() || 'Preview tag description',
    createdAt: Date.now(),
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const st = useHelpdesk.getState();
    if (initial) {
      const r = st.updateTag(initial.id, { name, color, description }, viewer);
      if (!r.ok) return toast.error(r.error);
      toast.success(`Updated #${normaliseTagName(name)}`);
      onClose();
    } else {
      const r = st.createTag({ name, color, description }, viewer);
      if (!r.ok) return toast.error(r.error);
      toast.success(`Created #${r.tag.name}`, 'Select devices on the right to apply it in bulk.');
      onCreated(r.tag);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit #${initial.name}` : 'Create device tag'}
      subtitle="Tags group devices across the fleet radar, saved views and lifecycle policies."
      icon={<Sparkles />}
      width={480}
      footer={
        <>
          <button type="button" className="neo-btn neo-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="tag-modal-form" className="neo-btn neo-btn--plasma" data-qa="tag-modal-submit">
            {initial ? <Check /> : <Plus />}
            {initial ? 'Save changes' : 'Create tag'}
          </button>
        </>
      }
    >
      <form id="tag-modal-form" className="hd-tags-form" onSubmit={submit}>
        <div className="hd-tags-preview">
          <div>
            <div className="neo-hud">Live preview</div>
            <div style={{ marginTop: 6 }}>
              <TagChip tag={previewTag} />
            </div>
          </div>
          <DeviceGlyph kind="laptop" size={56} color={color} />
        </div>

        <div className="neo-field">
          <label htmlFor="tag-name-input">Tag name</label>
          <input
            id="tag-name-input"
            className="neo-input"
            placeholder="e.g. field-kit or gpu-workstation"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            data-qa="tag-name-input"
          />
          <span className="neo-hint">Normalised to #{slug} (2–24 lowercase characters).</span>
        </div>

        <div className="neo-field">
          <label>Colour orb</label>
          <div className="hd-tags-swatches" role="radiogroup" aria-label="Tag colour">
            {TAG_SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                role="radio"
                aria-checked={color.toLowerCase() === sw.toLowerCase()}
                aria-pressed={color.toLowerCase() === sw.toLowerCase()}
                aria-label={`Colour ${sw}`}
                className="hd-tags-swatch"
                style={{ background: sw, boxShadow: `0 0 12px ${sw}66` }}
                onClick={() => setColor(sw)}
              />
            ))}
          </div>
        </div>

        <div className="neo-field">
          <label htmlFor="tag-desc-input">Description</label>
          <textarea
            id="tag-desc-input"
            className="neo-textarea"
            rows={3}
            placeholder="What hardware cohort, policy or team does this tag represent?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-qa="tag-desc-input"
          />
        </div>
      </form>
    </Modal>
  );
}
