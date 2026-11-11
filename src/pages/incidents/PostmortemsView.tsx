/**
 * Postmortems View (`/incidents/postmortems`) — 5-stage blameless postmortem tracker,
 * Nova AI RCA generator, 5 Whys causal chain, follow-up action items synced to
 * Projects, Calendar review meeting booking, and Wiki + Performance integration.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  FileText,
  FolderKanban,
  HelpCircle,
  ListChecks,
  Plus,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { Bar, Chip, NeoHome, NeoPanel, NovaChip, PeoplePicker } from '@/components/neo';
import { currentViewer, loadBridge } from '@/lib/appBridge';
import { useSessionUser } from '@/store/selectors';
import { toast } from '@/store/toast';
import { DAY } from '@/incidents/meta';
import { useIncidents } from '@/incidents/store';
import type { PostmortemStatus } from '@/incidents/types';
import { PostmortemLifecycleTracker, SevBadge, UserPill } from './parts';

export function PostmortemsView() {
  const me = useSessionUser();
  const [params, setParams] = useSearchParams();

  const incidents = useIncidents((s) => s.incidents);
  const postmortems = useIncidents((s) => s.postmortems);
  const generatePostmortem = useIncidents((s) => s.generatePostmortem);
  const updatePostmortemStatus = useIncidents((s) => s.updatePostmortemStatus);
  const toggleActionItem = useIncidents((s) => s.toggleActionItem);
  const addActionItem = useIncidents((s) => s.addActionItem);
  const linkActionTask = useIncidents((s) => s.linkActionTask);
  const setPostmortemReviewEvent = useIncidents((s) => s.setPostmortemReviewEvent);

  const paramId = params.get('id');
  const [selectedId, setSelectedId] = useState<string>(paramId ?? postmortems[0]?.id ?? 'pm-2044');

  useEffect(() => {
    if (paramId && postmortems.some((p) => p.id === paramId)) {
      setSelectedId(paramId);
    }
  }, [paramId, postmortems]);

  const pm = useMemo(
    () => postmortems.find((p) => p.id === selectedId) ?? postmortems[0],
    [postmortems, selectedId],
  );

  const linkedInc = useMemo(
    () => (pm ? incidents.find((i) => i.id === pm.incidentId) : undefined),
    [pm, incidents],
  );

  const incidentsWithoutPm = useMemo(
    () => incidents.filter((inc) => !postmortems.some((p) => p.incidentId === inc.id)),
    [incidents, postmortems],
  );

  const [newActTitle, setNewActTitle] = useState('');
  const [newActOwner, setNewActOwner] = useState(me?.id ?? 'u-lucas');
  const [newActPriority, setNewActPriority] = useState<'P1' | 'P2' | 'P3'>('P2');

  if (!pm) return null;

  const selectPm = (id: string) => {
    setSelectedId(id);
    setParams({ id }, { replace: true });
  };

  const doneCount = pm.actions.filter((a) => a.done).length;
  const actionPct = pm.actions.length ? doneCount / pm.actions.length : 0;

  const onAddAction = (e: FormEvent) => {
    e.preventDefault();
    if (!newActTitle.trim()) return;
    addActionItem(pm.id, {
      title: newActTitle,
      ownerId: newActOwner,
      priority: newActPriority,
      due: new Date(Date.now() + 5 * DAY).toISOString().slice(0, 10),
    });
    setNewActTitle('');
  };

  const createProjectTask = async (actionId: string) => {
    const act = pm.actions.find((a) => a.id === actionId);
    if (!act) return;
    try {
      const viewer = currentViewer();
      if (viewer) {
        const projects = await loadBridge('projects');
        const res = projects.createTask(viewer, {
          title: `[${linkedInc?.code ?? 'RCA'}] ${act.title}`,
          notes: `Postmortem follow-up action from ${pm.title}`,
          assigneeId: act.ownerId,
          dueDate: act.due,
          source: { app: 'incidents', label: pm.title, to: `/incidents/postmortems?id=${pm.id}` },
        });
        if (res.ok) {
          linkActionTask(pm.id, actionId, res.taskId, res.to);
          toast.success('Follow-up task created in Projects', act.title);
          return;
        }
      }
    } catch {
      // fallback
    }
    linkActionTask(pm.id, actionId, `task-${actionId}`, '/projects');
    toast.success('Follow-up task linked to Projects', act.title);
  };

  const scheduleReviewMeeting = async () => {
    const when = Date.now() + DAY;
    try {
      const { useCalendar } = await import('@/calendar/store');
      const ev = useCalendar.getState().createEvent({
        title: `Blameless Postmortem Review · ${pm.title}`,
        description: pm.sections.summary,
        category: 'meet',
        dayOffset: 1,
        startHour: 14,
        durationMins: 45,
        attendeeIds: [pm.authorId, ...pm.reviewerIds],
        linkedContext: { app: 'incidents', label: pm.title, to: `/incidents/postmortems?id=${pm.id}` },
        agendaBullets: ['Walk through auto-captured War Room timeline', 'Review 5 Whys causal chain', 'Verify P1/P2 remediation owners'],
      });
      setPostmortemReviewEvent(pm.id, ev?.id ?? 'cal-pm', when);
    } catch {
      setPostmortemReviewEvent(pm.id, 'cal-pm', when);
    }
    toast.success('Postmortem review scheduled in Helix Calendar');
  };

  const logPerformanceEvidence = async () => {
    try {
      const viewer = currentViewer();
      if (viewer) {
        const perf = await loadBridge('performance');
        perf.addEvidence(viewer, {
          userId: pm.authorId,
          title: `Authored blameless postmortem: ${pm.title}`,
          detail: pm.sections.rootCause,
          source: { app: 'incidents', label: pm.title, to: `/incidents/postmortems?id=${pm.id}` },
        });
      }
    } catch {
      // ignore
    }
    toast.success('Pinned postmortem to Performance evidence timeline');
  };

  const nextStatusMap: Record<PostmortemStatus, { next: PostmortemStatus; label: string } | null> = {
    draft: { next: 'review', label: 'Submit for Team Review' },
    review: { next: 'published', label: 'Publish to Handbook Wiki' },
    published: { next: 'actions-complete', label: 'Verify All Actions Complete' },
    'actions-complete': null,
  };
  const nextStep = nextStatusMap[pm.status];

  const mainCol = (
    <>
      {/* Postmortem Selector Strip */}
      <div className="inc-switcher" role="tablist" aria-label="Select postmortem">
        {postmortems.map((item) => {
          const active = item.id === pm.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className="inc-switcher__pill"
              data-active={active || undefined}
              onClick={() => selectPm(item.id)}
            >
              <FileText />
              <span className="truncate">{item.title}</span>
              <Chip tone={item.status === 'actions-complete' || item.status === 'published' ? 'success' : 'warning'} size="sm">
                <span>{item.status}</span>
              </Chip>
            </button>
          );
        })}
      </div>

      {/* 5-Stage Blameless Postmortem NeoTracker */}
      <PostmortemLifecycleTracker
        postmortem={pm}
        actions={
          <div className="inc-tracker-actions">
            {nextStep && (
              <button
                type="button"
                className="neo-btn neo-btn--plasma neo-btn--xs"
                onClick={() => updatePostmortemStatus(pm.id, nextStep.next)}
                data-qa="pm-advance-status"
              >
                <CheckCircle2 />
                <span>{nextStep.label}</span>
              </button>
            )}
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={scheduleReviewMeeting}
              data-qa="pm-schedule-review"
            >
              <CalendarDays />
              <span>{pm.reviewAt ? 'Reschedule Review' : 'Schedule Calendar Review'}</span>
            </button>
            <button
              type="button"
              className="neo-btn neo-btn--soft neo-btn--xs"
              onClick={logPerformanceEvidence}
            >
              <Award />
              <span>Pin to OKR Evidence</span>
            </button>
            {pm.wikiTo && (
              <Link to={pm.wikiTo} className="neo-btn neo-btn--ghost neo-btn--xs">
                <BookOpen />
                <span>Open in Wiki</span>
              </Link>
            )}
          </div>
        }
      />

      {/* Executive Summary, Impact & Root Cause */}
      <NeoPanel
        hud="Blameless root-cause analysis"
        title={pm.title}
        icon={<FileText />}
        actions={
          <div className="inc-inline-actions">
            {pm.novaDrafted && <NovaChip>Nova AI synthesized</NovaChip>}
            {linkedInc && <SevBadge severity={linkedInc.severity} />}
          </div>
        }
      >
        <div className="inc-pm-sections">
          <div className="inc-pm-block">
            <div className="neo-hud">Executive summary</div>
            <p>{pm.sections.summary}</p>
          </div>
          <div className="inc-pm-block">
            <div className="neo-hud">Customer & SLO impact</div>
            <p>{pm.sections.impact}</p>
          </div>
          <div className="inc-pm-block inc-pm-block--highlight">
            <div className="neo-hud">Technical root cause</div>
            <p>{pm.sections.rootCause}</p>
          </div>
        </div>

        <div className="inc-pm-columns">
          <div className="inc-pm-col">
            <div className="neo-hud">Contributing factors</div>
            <ul className="inc-bullet-list">
              {pm.sections.contributing.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="inc-pm-col">
            <div className="neo-hud">What went well</div>
            <ul className="inc-bullet-list">
              {pm.sections.wentWell.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="inc-pm-col">
            <div className="neo-hud">Lessons learned</div>
            <ul className="inc-bullet-list">
              {pm.sections.lessons.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </NeoPanel>

      {/* 5 Whys Causal Chain */}
      <NeoPanel hud="Iterative causal chain" title="Five Whys Analysis" icon={<HelpCircle />}>
        <ol className="inc-whys-list">
          {pm.sections.whys.map((why, idx) => (
            <li key={idx} className="inc-why-item">
              <span className="inc-why-num neo-mono">WHY #{idx + 1}</span>
              <p>{why}</p>
            </li>
          ))}
        </ol>
      </NeoPanel>

      {/* Follow-Up Action Items */}
      <NeoPanel
        hud={`Preventative engineering work · ${doneCount}/${pm.actions.length} complete`}
        title="Remediation Action Items (Synced to Projects)"
        icon={<ListChecks />}
      >
        <Bar value={actionPct} label="Remediation action progress" />

        <div className="inc-actions-list">
          {pm.actions.map((act) => (
            <div key={act.id} className="inc-action-row" data-done={act.done || undefined}>
              <label className="inc-action-row__check">
                <input
                  type="checkbox"
                  checked={act.done}
                  onChange={() => toggleActionItem(pm.id, act.id)}
                />
                <span>{act.title}</span>
              </label>
              <div className="inc-action-row__meta">
                <Chip tone={act.priority === 'P1' ? 'danger' : act.priority === 'P2' ? 'warning' : 'slate'} size="sm">
                  <span>{act.priority}</span>
                </Chip>
                <span className="neo-mono inc-muted">Due {act.due}</span>
                <UserPill userId={act.ownerId} size={18} />
                {act.taskTo ? (
                  <Link to={act.taskTo} className="neo-btn neo-btn--ghost neo-btn--xs">
                    <FolderKanban />
                    <span>Open Task</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="neo-btn neo-btn--soft neo-btn--xs"
                    onClick={() => createProjectTask(act.id)}
                    data-qa={`pm-task-${act.id}`}
                  >
                    <FolderKanban />
                    <span>Create in Projects</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <form className="inc-scribe-form" onSubmit={onAddAction}>
          <select
            className="neo-input neo-input--sm"
            style={{ width: 84 }}
            value={newActPriority}
            onChange={(e) => setNewActPriority(e.target.value as 'P1' | 'P2' | 'P3')}
          >
            <option value="P1">P1</option>
            <option value="P2">P2</option>
            <option value="P3">P3</option>
          </select>
          <input
            type="text"
            className="neo-input neo-input--sm"
            placeholder="Add preventative follow-up action item…"
            value={newActTitle}
            onChange={(e) => setNewActTitle(e.target.value)}
          />
          <PeoplePicker
            value={[newActOwner]}
            onChange={(ids) => setNewActOwner(ids[0] ?? 'u-lucas')}
            label="Assign action owner"
            trigger={(props) => (
              <button {...props} type="button" className="neo-btn neo-btn--soft neo-btn--sm">
                <UserPill userId={newActOwner} size={18} />
              </button>
            )}
          />
          <button type="submit" className="neo-btn neo-btn--plasma neo-btn--sm">
            <Plus />
            <span>Add Action</span>
          </button>
        </form>
      </NeoPanel>
    </>
  );

  const sideCol = (
    <>
      <NeoPanel
        hud="Nova AI postmortem generator"
        title="Synthesize from Incident Timeline"
        icon={<Sparkles />}
      >
        {incidentsWithoutPm.length === 0 ? (
          <p className="inc-muted">Every incident has a Nova-synthesized postmortem.</p>
        ) : (
          <div className="inc-side-list">
            {incidentsWithoutPm.map((inc) => (
              <div key={inc.id} className="inc-side-card">
                <div className="inc-row-card__badges">
                  <span className="neo-mono">{inc.code}</span>
                  <SevBadge severity={inc.severity} />
                </div>
                <b>{inc.title}</b>
                <p className="inc-muted">{inc.timeline.length} timeline events & runbook steps ready to synthesize.</p>
                <button
                  type="button"
                  className="neo-btn neo-btn--nova neo-btn--xs"
                  onClick={() => {
                    const created = generatePostmortem(inc.id, me?.id ?? 'u-priya');
                    if (created) selectPm(created.id);
                  }}
                  data-qa={`draft-pm-${inc.id}`}
                >
                  <Sparkles />
                  <span>Draft with Nova</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </NeoPanel>

      <NeoPanel hud="Governance & sign-off" title="Author & Reviewers" icon={<UserCheck />}>
        <div className="inc-side-list">
          <div className="inc-sub-row">
            <span className="inc-muted">Lead author</span>
            <UserPill userId={pm.authorId} />
          </div>
          <div className="inc-sub-row">
            <span className="inc-muted">Reviewers</span>
            <div className="inc-declare-preview__pills">
              {pm.reviewerIds.map((id) => (
                <UserPill key={id} userId={id} size={18} />
              ))}
            </div>
          </div>
          {linkedInc && (
            <Link to={`/incidents/war-room?id=${linkedInc.id}`} className="neo-btn neo-btn--soft neo-btn--xs">
              <span>Inspect {linkedInc.code} War Room</span>
            </Link>
          )}
        </div>
      </NeoPanel>
    </>
  );

  return <NeoHome main={mainCol} side={sideCol} sideLabel="Nova postmortem synthesis & reviewers" />;
}
