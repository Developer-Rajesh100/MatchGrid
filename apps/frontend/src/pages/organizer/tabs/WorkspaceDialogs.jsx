import React from 'react';
import { ChevronRight, AlertTriangle } from 'lucide-react';
import { Modal, Field, Actions } from '../../../components/common/Dialog';
import { ImageUploader } from '../../../components/common/ImageUploader';

export function WorkspaceDialogs({ ws }) {
  const { dialog, closeDialog, activeTournament } = ws;
  if (!dialog) return null;

  if (dialog === 'wizard') {
    const { wizardForm, setWizardForm, wizardStep, setWizardStep, wizardError, wizardSubmitting } = ws;
    const setCfg = (key, value) => setWizardForm({ ...wizardForm, config: { ...wizardForm.config, [key]: value } });
    const num = (e) => parseInt(e.target.value, 10);
    return (
      <Modal
        testId="wizard-modal"
        title="Tournament Creation Wizard"
        subtitle={`Step ${wizardStep} of 2: ${wizardStep === 1 ? 'Identity & Branding' : 'Format & Competition Rules'}`}
        wide
        onClose={closeDialog}
      >
        {wizardError && <div className="ow-alert" role="alert">{wizardError}</div>}
        <form onSubmit={ws.handleCreateTournament} className="ow-form">
          {wizardStep === 1 ? (
            <>
              <Field label="Tournament Name *">
                <input type="text" required placeholder="e.g. Champions Cup 2026" data-testid="wizard-name" value={wizardForm.name} onChange={ws.handleWizardNameChange} className="form-input" />
              </Field>
              <div className="ow-form__pair">
                <Field label="Season *">
                  <input type="text" required data-testid="wizard-season" value={wizardForm.season} onChange={(e) => setWizardForm({ ...wizardForm, season: e.target.value })} className="form-input" />
                </Field>
                <Field label="URL Slug">
                  <input type="text" data-testid="wizard-slug" value={wizardForm.slug} onChange={(e) => setWizardForm({ ...wizardForm, slug: e.target.value })} className="form-input" />
                </Field>
              </div>
              <Field label="Description (Optional)">
                <textarea rows={2} data-testid="wizard-description" value={wizardForm.description} onChange={(e) => setWizardForm({ ...wizardForm, description: e.target.value })} className="form-input" />
              </Field>
              <div className="ow-form__pair">
                <div>
                  <span className="ow-field__label">Tournament Crest / Logo</span>
                  <ImageUploader category="crests" currentUrl={wizardForm.logo_url} onUploadSuccess={(url) => setWizardForm((p) => ({ ...p, logo_url: url }))} />
                </div>
                <div>
                  <span className="ow-field__label">Hero Banner</span>
                  <ImageUploader category="banners" currentUrl={wizardForm.banner_url} onUploadSuccess={(url) => setWizardForm((p) => ({ ...p, banner_url: url }))} />
                </div>
              </div>
              <Actions>
                <button type="button" disabled={!wizardForm.name.trim()} onClick={() => setWizardStep(2)} className="btn btn-primary" data-testid="wizard-next-btn">
                  Next: Rules & Format <ChevronRight size={14} aria-hidden="true" />
                </button>
              </Actions>
            </>
          ) : (
            <>
              <div className="ow-form__pair">
                <Field label="Number of Groups">
                  <select data-testid="wizard-num-groups" value={wizardForm.config.num_groups} onChange={(e) => setCfg('num_groups', num(e))} className="form-input">
                    <option value={2}>2 Groups (A, B)</option>
                    <option value={4}>4 Groups (A, B, C, D)</option>
                  </select>
                </Field>
                <Field label="Teams Per Group">
                  <input type="number" min={2} max={8} data-testid="wizard-teams-per-group" value={wizardForm.config.teams_per_group} onChange={(e) => setCfg('teams_per_group', num(e))} className="form-input" />
                </Field>
              </div>
              <div className="ow-form__pair">
                <Field label="Qualifiers Per Group">
                  <input type="number" min={1} max={4} data-testid="wizard-qualifiers-per-group" value={wizardForm.config.qualifiers_per_group} onChange={(e) => setCfg('qualifiers_per_group', num(e))} className="form-input" />
                </Field>
                <Field label="Knockout Bracket Format">
                  <select data-testid="wizard-knockout-format" value={wizardForm.config.knockout_format} onChange={(e) => setCfg('knockout_format', e.target.value)} className="form-input">
                    <option value="semis_final">Semi-Finals & Final</option>
                    <option value="quarters_semis_final">Quarter-Finals, Semis & Final</option>
                    <option value="none">No Knockout Stage (Round-Robin Only)</option>
                  </select>
                </Field>
              </div>
              <div className="ow-form__pair">
                <Field label="Half Duration (Minutes)">
                  <input type="number" min={5} max={45} data-testid="wizard-half-duration" value={wizardForm.config.match_duration_half_minutes} onChange={(e) => setCfg('match_duration_half_minutes', num(e))} className="form-input" />
                </Field>
                <div>
                  <span className="ow-field__label">Points (Win / Draw / Loss)</span>
                  <div className="ow-muted ow-form__static">3 pts (Win) / 1 pt (Draw) / 0 pts (Loss)</div>
                </div>
              </div>
              <Actions split>
                <button type="button" onClick={() => setWizardStep(1)} className="btn btn-outline" data-testid="wizard-back-btn">Back</button>
                <button type="submit" disabled={wizardSubmitting} className="btn btn-primary" data-testid="wizard-submit-btn">
                  {wizardSubmitting ? 'Creating Competition...' : 'Create Tournament'}
                </button>
              </Actions>
            </>
          )}
        </form>
      </Modal>
    );
  }

  if (dialog === 'club') {
    const { clubForm, setClubForm, clubSubmitting } = ws;
    return (
      <Modal testId="add-club-modal" title="Register Participating Club" onClose={closeDialog}>
        <form onSubmit={ws.handleCreateClub} className="ow-form">
          <Field label="Club Name *">
            <input type="text" required placeholder="e.g. Dynamo FC" data-testid="club-name-input" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} className="form-input" />
          </Field>
          <Field label="Club Color">
            <span className="ow-color">
              <input type="color" data-testid="club-color-input" value={clubForm.color} onChange={(e) => setClubForm({ ...clubForm, color: e.target.value })} />
              <span className="num">{clubForm.color}</span>
            </span>
          </Field>
          <div>
            <span className="ow-field__label">Team Crest / Logo</span>
            <ImageUploader category="crests" tournamentId={activeTournament?.id} currentUrl={clubForm.crest_url} onUploadSuccess={(url) => setClubForm((p) => ({ ...p, crest_url: url }))} />
          </div>
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={clubSubmitting} className="btn btn-primary" data-testid="club-submit-btn">
              {clubSubmitting ? 'Registering...' : 'Register Club'}
            </button>
          </Actions>
        </form>
      </Modal>
    );
  }

  if (dialog === 'player') {
    const { playerForm, setPlayerForm, playerSubmitting } = ws;
    return (
      <Modal testId="add-player-modal" title="Enroll Squad Player" onClose={closeDialog}>
        <form onSubmit={ws.handleCreatePlayer} className="ow-form">
          <Field label="Full Name *">
            <input type="text" required placeholder="e.g. Leo Silva" data-testid="player-name-input" value={playerForm.name} onChange={(e) => setPlayerForm({ ...playerForm, name: e.target.value })} className="form-input" />
          </Field>
          <Field label="Jersey Number">
            <input type="number" placeholder="e.g. 10" data-testid="player-number-input" value={playerForm.number} onChange={(e) => setPlayerForm({ ...playerForm, number: e.target.value })} className="form-input" />
          </Field>
          <label className="ow-check" htmlFor="managerCheck">
            <input type="checkbox" id="managerCheck" data-testid="player-manager-check" checked={playerForm.is_manager} onChange={(e) => setPlayerForm({ ...playerForm, is_manager: e.target.checked })} />
            <span>Designate as Team Manager</span>
          </label>
          <div>
            <span className="ow-field__label">Player Headshot</span>
            <ImageUploader category="photos" tournamentId={activeTournament?.id} currentUrl={playerForm.photo_url} onUploadSuccess={(url) => setPlayerForm((p) => ({ ...p, photo_url: url }))} />
          </div>
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={playerSubmitting} className="btn btn-primary" data-testid="player-submit-btn">
              {playerSubmitting ? 'Enrolling...' : 'Enroll Player'}
            </button>
          </Actions>
        </form>
      </Modal>
    );
  }

  if (dialog === 'scorer') {
    const { scorerForm, setScorerForm, scorerSubmitting } = ws;
    return (
      <Modal testId="provision-scorer-modal" title="Provision Scorer Operator" onClose={closeDialog}>
        <form onSubmit={ws.handleCreateScorer} className="ow-form">
          <Field label="Username *">
            <input type="text" required placeholder="e.g. scorer_pitch1" data-testid="scorer-username-input" value={scorerForm.username} onChange={(e) => setScorerForm({ ...scorerForm, username: e.target.value })} className="form-input" />
          </Field>
          <Field label="Password *">
            <input type="password" required placeholder="Min 6 characters" data-testid="scorer-password-input" value={scorerForm.password} onChange={(e) => setScorerForm({ ...scorerForm, password: e.target.value })} className="form-input" />
          </Field>
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={scorerSubmitting} className="btn btn-primary" data-testid="submit-scorer-btn">
              {scorerSubmitting ? 'Provisioning...' : 'Provision Scorer'}
            </button>
          </Actions>
        </form>
      </Modal>
    );
  }

  if (dialog === 'assign' && ws.selectedMatchForAssign) {
    const { scorers, selectedScorerIdToAssign, setSelectedScorerIdToAssign } = ws;
    return (
      <Modal testId="assign-scorer-modal" title={`Assign Scorer to Match #${ws.selectedMatchForAssign.match_number}`} onClose={closeDialog}>
        <form onSubmit={ws.handleAssignScorer} className="ow-form">
          <Field label="Select Scorer Operator">
            {scorers.length === 0 ? (
              <span className="ow-muted">No scorers provisioned yet. Please provision a scorer first.</span>
            ) : (
              <select data-testid="select-scorer-dropdown" value={selectedScorerIdToAssign} onChange={(e) => setSelectedScorerIdToAssign(e.target.value)} className="form-input">
                {scorers.map((s) => (
                  <option key={s.id} value={s.id}>{s.username}</option>
                ))}
              </select>
            )}
          </Field>
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={scorers.length === 0} className="btn btn-primary" data-testid="confirm-assign-btn">Assign Operator</button>
          </Actions>
        </form>
      </Modal>
    );
  }

  if (dialog === 'schedule' && ws.selectedMatchForSchedule) {
    const { scheduleForm, setScheduleForm } = ws;
    const set = (k) => (e) => setScheduleForm({ ...scheduleForm, [k]: e.target.value });
    return (
      <Modal testId="schedule-match-modal" title={`Edit Schedule: Match #${ws.selectedMatchForSchedule.match_number}`} onClose={closeDialog}>
        <form onSubmit={ws.handleUpdateSchedule} className="ow-form">
          <div className="ow-form__pair">
            <Field label="Date"><input type="date" data-testid="match-date-input" value={scheduleForm.date} onChange={set('date')} className="form-input" /></Field>
            <Field label="Time"><input type="time" data-testid="match-time-input" value={scheduleForm.time} onChange={set('time')} className="form-input" /></Field>
          </div>
          <Field label="Venue"><input type="text" placeholder="e.g. Pitch 1" data-testid="match-venue-input" value={scheduleForm.venue} onChange={set('venue')} className="form-input" /></Field>
          <Field label="Round Label"><input type="text" placeholder="e.g. Group A Matchday 1" data-testid="match-label-input" value={scheduleForm.label} onChange={set('label')} className="form-input" /></Field>
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" className="btn btn-primary" data-testid="save-schedule-btn">Save Schedule</button>
          </Actions>
        </form>
      </Modal>
    );
  }

  if (dialog === 'delete' && activeTournament) {
    const { deleteConfirmName, setDeleteConfirmName, deleteSubmitting } = ws;
    return (
      <Modal testId="delete-tournament-modal" title="Confirm Competition Deletion" titleClass="is-danger" onClose={closeDialog}>
        <p className="ow-muted ow-modal__text">
          <AlertTriangle size={14} aria-hidden="true" /> This will cascade-delete <strong>{activeTournament.name}</strong>, all clubs, players, fixtures, and standings. To proceed, please type the tournament name below:
        </p>
        <form onSubmit={ws.handleDeleteTournament} className="ow-form">
          <input type="text" aria-label="Type the tournament name to confirm" placeholder={activeTournament.name} data-testid="delete-confirm-input" value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} className="form-input" />
          <Actions>
            <button type="button" onClick={closeDialog} className="btn btn-outline">Cancel</button>
            <button type="submit" disabled={deleteConfirmName !== activeTournament.name || deleteSubmitting} className="btn btn-danger" data-testid="confirm-delete-tournament-btn">
              {deleteSubmitting ? 'Deleting...' : 'Permanently Delete'}
            </button>
          </Actions>
        </form>
      </Modal>
    );
  }

  return null;
}

export default WorkspaceDialogs;
