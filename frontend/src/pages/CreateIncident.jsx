import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Calendar, Trash2, Check, X, Upload, FileText, UploadCloud } from "lucide-react";
import Field from "../components/Field";
import TagInput from "../components/TagInput";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

const inputClass =
  "w-full bg-panel2 border border-line rounded px-3 py-2 text-sm text-paper outline-none focus:border-cyan appearance-none";

const ASSETS = ["Web Server 01", "Web Server 02", "DB Server 01", "Mail Server", "VPN Gateway", "Domain Controller"];
const COUNTRIES = ["China", "United States", "Russia", "Brazil", "Germany", "India", "Vietnam", "Iran", "North Korea", "Unknown"];
const ATTACK_TYPES = [
  "Web Application Attack",
  "Administrative Privilege Gain",
  "Information Leak",
  "Potentially Bad Traffic",
  "Command Execution",
  "Denial of Service",
  "Website Defacement",
];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const SHIFTS = ["Morning", "Afternoon", "Night"];
const HTTP_CODES = ["200", "301", "302", "400", "401", "403", "404", "500", "502", "503"];
const IOC_TYPES = ["IP Address", "Domain", "URL", "File Hash", "Email"];
const THREAT_INTEL_SOURCES = ["VirusTotal", "AlienVault OTX", "MISP", "Recorded Future", "Internal Threat Feed", "Other"];

const STEPS = [
  { n: 1, label: "Incident Details" },
  { n: 2, label: "Add IOCs" },
  { n: 3, label: "Review" },
];

function Select({ value, onChange, options, placeholder }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="" className="text-faint">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
    </div>
  );
}

function Stepper({ step }) {
  return (
    <div className="flex items-center px-3 sm:px-6 py-6">
      {STEPS.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                step === s.n
                  ? "bg-cyan text-ink"
                  : step > s.n
                  ? "bg-cyan/25 text-cyan"
                  : "border border-line text-faint"
              }`}
            >
              {step > s.n ? <Check size={13} /> : s.n}
            </div>
            <span className={`font-display text-xs sm:text-sm ${step === s.n ? "text-paper font-semibold" : "text-faint"}`}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && <div className="flex-1 min-w-2 h-px bg-line mx-2 sm:mx-4" />}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function CreateIncident() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isDefacement = params.get("defacement") === "1";

  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    alertName: "",
    sourceIp: [],
    destinationIp: [],
    dateTime: "",
    assetName: "",
    originCountry: "",
    attackType: isDefacement ? "Website Defacement" : "",
    severity: "",
    shift: "",
    httpStatus: [],
    summary: "",
    impact: "",
    recommendations: "",
  });

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const emptyDraft = {
    type: "",
    threatIntelligence: "",
    count: "",
    percentage: "",
    description: "",
    images: [],
    documents: [],
  };

  const [iocs, setIocs] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [iocError, setIocError] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  function setDraftField(key, val) {
    setDraft((d) => ({ ...d, [key]: val }));
  }

  async function handleImageUpload(e) {
    const files = Array.from(e.target.files || []).slice(0, 5);
    e.target.value = ""; // allow re-selecting the same file later
    if (!files.length) return;

    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      setIocError(`"${tooBig.name}" exceeds the 10MB limit.`);
      return;
    }

    setUploadingImages(true);
    setIocError("");
    try {
      const uploaded = await api.uploadFiles(token, files);
      setDraftField("images", [...draft.images, ...uploaded]);
    } catch (err) {
      setIocError(err.message);
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleDocUpload(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const tooBig = files.find((f) => f.size > 10 * 1024 * 1024);
    if (tooBig) {
      setIocError(`"${tooBig.name}" exceeds the 10MB limit.`);
      return;
    }

    setUploadingDocs(true);
    setIocError("");
    try {
      const uploaded = await api.uploadFiles(token, files);
      setDraftField("documents", [...draft.documents, ...uploaded]);
    } catch (err) {
      setIocError(err.message);
    } finally {
      setUploadingDocs(false);
    }
  }

  function removeImage(storedName) {
    setDraftField("images", draft.images.filter((f) => f.storedName !== storedName));
  }

  function removeDocument(storedName) {
    setDraftField("documents", draft.documents.filter((f) => f.storedName !== storedName));
  }

  function addIoc() {
    if (uploadingImages || uploadingDocs) return setIocError("Wait for uploads to finish before adding the IOC.");
    if (!draft.type || !draft.threatIntelligence) {
      setIocError("IOC Type and Threat Intelligence source are required.");
      return;
    }
    setIocError("");
    setIocs((prev) => [...prev, draft]);
    setDraft(emptyDraft);
  }

  function removeDraft() {
    if (uploadingImages || uploadingDocs) return setIocError("Wait for uploads to finish before clearing the IOC.");
    setDraft(emptyDraft);
    setIocError("");
  }

  function removeIoc(idx) {
    setIocs((prev) => prev.filter((_, i) => i !== idx));
  }

  function validateStep1() {
    const required = [
      "alertName", "dateTime", "assetName", "originCountry",
      "attackType", "severity", "shift",
    ];
    for (const key of required) {
      if (!form[key]) return `Please fill in all required fields.`;
    }
    if (form.sourceIp.length === 0) return "Add at least one source IP address.";
    if (form.destinationIp.length === 0) return "Add at least one destination IP address.";
    if (form.httpStatus.length === 0) return "Select at least one HTTP status code.";
    if (!form.summary || !form.impact || !form.recommendations) return "Please fill in all required fields.";
    return "";
  }

  function goNext() {
    if (uploadingImages || uploadingDocs) return setError("Wait for uploads to finish.");
    if (step === 2 && (draft.type || draft.value || draft.images.length || draft.documents.length)) return setError("Add or clear your draft IOC before continuing.");
    setError("");
    if (step === 1) {
      const err = validateStep1();
      if (err) return setError(err);
    }
    setStep((s) => Math.min(3, s + 1));
  }

  function goBack() {
    setError("");
    setStep((s) => Math.max(1, s - 1));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const created = await api.createCase(token, {
        title: form.alertName,
        severity: form.severity,
        attack_type: form.attackType,
        origin_country: form.originCountry,
        source_ip: form.sourceIp,
        destination_ip: form.destinationIp,
        incident_datetime: form.dateTime,
        asset_name: form.assetName,
        shift: form.shift,
        http_status: form.httpStatus,
        summary: form.summary,
        impact: form.impact,
        recommendations: form.recommendations,
        iocs,
      });
      navigate(`/cases/${created.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="-m-6">
      <div className="px-6 py-5 border-b border-line flex items-center justify-between">
        <h1 className="font-display text-lg font-semibold text-paper tracking-wide">Add New Incident</h1>
        <button
          onClick={() => navigate("/incidents")}
          className="w-8 h-8 rounded flex items-center justify-center text-muted hover:bg-panel2 hover:text-paper"
        >
          <X size={18} />
        </button>
      </div>

      <div className="border-b border-line">
        <Stepper step={step} />
      </div>

      <div className="p-6 max-w-5xl">
        <div className="bg-panel border border-line rounded-xl p-6">
          {error && (
            <div className="mb-5 text-sm text-thread bg-thread/10 border border-thread/30 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <Field label="ALERT NAME">
                <input
                  value={form.alertName}
                  onChange={(e) => set("alertName", e.target.value)}
                  placeholder="Enter alert name here"
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label="SOURCE IP" help>
                  <TagInput
                    value={form.sourceIp}
                    onChange={(v) => set("sourceIp", v)}
                    placeholder="Enter source IP addresses"
                  />
                </Field>
                <Field label="DESTINATION IP" help>
                  <TagInput
                    value={form.destinationIp}
                    onChange={(v) => set("destinationIp", v)}
                    placeholder="Enter destination IP addresses"
                  />
                </Field>

                <Field label="DATE AND TIME">
                  <div className="relative">
                    <input
                      type="datetime-local"
                      value={form.dateTime}
                      onChange={(e) => set("dateTime", e.target.value)}
                      className={`${inputClass} pr-9`}
                    />
                    <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  </div>
                </Field>
                <Field label="ASSET NAME">
                  <Select
                    value={form.assetName}
                    onChange={(v) => set("assetName", v)}
                    options={ASSETS}
                    placeholder="Select asset name here"
                  />
                </Field>

                <Field label="ATTACK ORIGIN COUNTRY">
                  <Select
                    value={form.originCountry}
                    onChange={(v) => set("originCountry", v)}
                    options={COUNTRIES}
                    placeholder="Select attack origin country here"
                  />
                </Field>
                <Field label="ATTACK TYPE">
                  <Select
                    value={form.attackType}
                    onChange={(v) => set("attackType", v)}
                    options={ATTACK_TYPES}
                    placeholder="Select attack type here"
                  />
                </Field>

                <Field label="SEVERITY">
                  <Select
                    value={form.severity}
                    onChange={(v) => set("severity", v)}
                    options={SEVERITIES}
                    placeholder="Select severity level here"
                  />
                </Field>
                <Field label="SHIFT">
                  <Select
                    value={form.shift}
                    onChange={(v) => set("shift", v)}
                    options={SHIFTS}
                    placeholder="Select shift here"
                  />
                </Field>
              </div>

              <Field label="HTTP STATUS" help>
                <TagInput
                  value={form.httpStatus}
                  onChange={(v) => set("httpStatus", v)}
                  placeholder="Select HTTP status codes"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {HTTP_CODES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() =>
                        set(
                          "httpStatus",
                          form.httpStatus.includes(c)
                            ? form.httpStatus.filter((x) => x !== c)
                            : [...form.httpStatus, c]
                        )
                      }
                      className={`text-[11px] px-2 py-1 rounded-xl border ${
                        form.httpStatus.includes(c)
                          ? "border-amber bg-amber/15 text-amber"
                          : "border-line text-muted hover:bg-panel2"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="SUMMARY">
                <textarea
                  value={form.summary}
                  onChange={(e) => set("summary", e.target.value)}
                  placeholder="Enter a brief summary of the incident here"
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </Field>
              <Field label="IMPACT">
                <textarea
                  value={form.impact}
                  onChange={(e) => set("impact", e.target.value)}
                  placeholder="Describe the impact of the incident here"
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </Field>
              <Field label="INITIAL RECOMMENDATIONS">
                <textarea
                  value={form.recommendations}
                  onChange={(e) => set("recommendations", e.target.value)}
                  placeholder="Enter initial recommendations here"
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </Field>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              {iocError && (
                <div className="text-sm text-thread bg-thread/10 border border-thread/30 rounded px-3 py-2">
                  {iocError}
                </div>
              )}

              <div className="border border-line rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                  <Field label="IOC TYPE">
                    <Select
                      value={draft.type}
                      onChange={(v) => setDraftField("type", v)}
                      options={IOC_TYPES}
                      placeholder="Select IOC type here"
                    />
                  </Field>
                  <Field label="THREAT INTELLIGENCE">
                    <Select
                      value={draft.threatIntelligence}
                      onChange={(v) => setDraftField("threatIntelligence", v)}
                      options={THREAT_INTEL_SOURCES}
                      placeholder="Select source here"
                    />
                  </Field>

                  <div>
                    <label className="font-body text-xs font-medium text-muted mb-2 block">COUNT</label>
                    <input
                      type="number"
                      value={draft.count}
                      onChange={(e) => setDraftField("count", e.target.value)}
                      placeholder="Enter count"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="font-body text-xs font-medium text-muted mb-2 block">IOC IMAGES</label>
                    <label className={`flex flex-col items-center justify-center gap-1.5 border border-dashed border-line rounded py-4 transition-colors ${uploadingImages ? "opacity-60" : "cursor-pointer hover:border-amber/50"}`}>
                      <UploadCloud size={18} className="text-faint" />
                      <span className="text-xs text-muted">{uploadingImages ? "Uploading..." : "Upload"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingImages}
                        onChange={handleImageUpload}
                      />
                    </label>
                    <p className="text-[11px] text-faint mt-1">Upload up to 5 images (max 10MB each)</p>
                    {draft.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {draft.images.map((f) => (
                          <span key={f.storedName} className="flex items-center gap-1 text-[11px] bg-panel2 text-paper rounded px-2 py-1">
                            <a href={api.fileUrl(token, f.url)} target="_blank" rel="noreferrer" className="hover:text-amber truncate max-w-[100px]">
                              {f.originalName}
                            </a>
                            <button type="button" onClick={() => removeImage(f.storedName)} className="text-faint hover:text-thread">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="font-body text-xs font-medium text-muted mb-2 block">PERCENTAGE</label>
                    <input
                      type="number"
                      value={draft.percentage}
                      onChange={(e) => setDraftField("percentage", e.target.value)}
                      placeholder="Enter percentage"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="font-body text-xs font-medium text-muted mb-2 block">RELATED DOCUMENTS</label>
                    <label className={`flex items-center justify-center gap-1.5 border border-line rounded py-2 transition-colors text-sm text-paper ${uploadingDocs ? "opacity-60" : "cursor-pointer hover:bg-panel2"}`}>
                      <Upload size={14} />
                      {uploadingDocs ? "Uploading..." : "Upload Files"}
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={uploadingDocs}
                        onChange={handleDocUpload}
                      />
                    </label>
                    <p className="text-[11px] text-faint mt-1">Upload related documents (max 10MB each)</p>
                    {draft.documents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {draft.documents.map((f) => (
                          <span key={f.storedName} className="flex items-center gap-1 text-[11px] bg-panel2 text-paper rounded px-2 py-1">
                            <FileText size={10} className="shrink-0" />
                            <a href={api.fileUrl(token, f.url)} target="_blank" rel="noreferrer" className="hover:text-amber truncate max-w-[100px]">
                              {f.originalName}
                            </a>
                            <button type="button" onClick={() => removeDocument(f.storedName)} className="text-faint hover:text-thread">
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="font-body text-xs font-medium text-muted mb-2 block">DESCRIPTION</label>
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraftField("description", e.target.value)}
                      placeholder="Enter IOC description here"
                      rows={3}
                      className={`${inputClass} resize-y`}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-5">
                  <button
                    type="button"
                    onClick={removeDraft}
                    className="text-sm text-paper border border-line hover:bg-panel2 px-4 py-2 rounded"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={addIoc}
                    className="bg-cyan hover:brightness-110 text-ink text-sm font-semibold px-5 py-2 rounded transition-all"
                  >
                    Add IOC
                  </button>
                </div>
              </div>

              {iocs.length > 0 && (
                <div className="border border-line rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-faint text-xs bg-panel2 border-b border-line">
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Threat Intel</th>
                        <th className="py-2 px-3">Count</th>
                        <th className="py-2 px-3">%</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Files</th>
                        <th className="py-2 px-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {iocs.map((ioc, i) => (
                        <tr key={i} className="border-b border-line last:border-0">
                          <td className="py-2 px-3 text-paper">{ioc.type}</td>
                          <td className="py-2 px-3 text-paper">{ioc.threatIntelligence}</td>
                          <td className="py-2 px-3 text-muted">{ioc.count || "—"}</td>
                          <td className="py-2 px-3 text-muted">{ioc.percentage ? `${ioc.percentage}%` : "—"}</td>
                          <td className="py-2 px-3 text-muted max-w-[200px] truncate">{ioc.description || "—"}</td>
                          <td className="py-2 px-3 text-muted">
                            {ioc.images.length + ioc.documents.length > 0
                              ? `${ioc.images.length} img · ${ioc.documents.length} doc`
                              : "—"}
                          </td>
                          <td className="py-2 px-3">
                            <button onClick={() => removeIoc(i)} className="text-faint hover:text-thread">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-faint">IOCs are optional — you can skip this step and add them later from the case detail page.</p>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-6">
              <ReviewSection title="Incident Details">
                <ReviewRow label="Alert Name" value={form.alertName} />
                <ReviewRow label="Source IP" value={form.sourceIp.join(", ")} />
                <ReviewRow label="Destination IP" value={form.destinationIp.join(", ")} />
                <ReviewRow label="Date and Time" value={form.dateTime} />
                <ReviewRow label="Asset Name" value={form.assetName} />
                <ReviewRow label="Attack Origin Country" value={form.originCountry} />
                <ReviewRow label="Attack Type" value={form.attackType} />
                <ReviewRow label="Severity" value={form.severity} />
                <ReviewRow label="Shift" value={form.shift} />
                <ReviewRow label="HTTP Status" value={form.httpStatus.join(", ")} />
              </ReviewSection>
              <ReviewSection title="Narrative">
                <ReviewRow label="Summary" value={form.summary} block />
                <ReviewRow label="Impact" value={form.impact} block />
                <ReviewRow label="Initial Recommendations" value={form.recommendations} block />
              </ReviewSection>
              <ReviewSection title={`Indicators of Compromise (${iocs.length})`}>
                {iocs.length === 0 ? (
                  <div className="text-faint text-sm">None added</div>
                ) : (
                  <div className="space-y-2">
                    {iocs.map((ioc, i) => (
                      <div key={i} className="text-sm text-paper border-b border-line last:border-0 pb-2">
                        <div>
                          <span className="text-faint">{ioc.type}</span> · {ioc.threatIntelligence}
                          {ioc.count && <span className="text-faint"> · count {ioc.count}</span>}
                          {ioc.percentage && <span className="text-faint"> · {ioc.percentage}%</span>}
                        </div>
                        {ioc.description && <div className="text-muted text-xs mt-0.5">{ioc.description}</div>}
                        {(ioc.images.length > 0 || ioc.documents.length > 0) && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {[...ioc.images, ...ioc.documents].map((f) => (
                              <a
                                key={f.storedName}
                                href={api.fileUrl(token, f.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-amber hover:text-amber underline"
                              >
                                {f.originalName}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>
            </div>
          )}
        </div>

        {/* Nav buttons */}
        <div className="flex items-center justify-between mt-5">
          <button
            type="button"
            onClick={() => (step === 1 ? navigate(-1) : goBack())}
            className="text-sm text-muted hover:text-paper px-4 py-2"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="bg-cyan hover:brightness-110 text-ink text-sm font-semibold px-5 py-2.5 rounded transition-all"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="bg-cyan hover:brightness-110 disabled:opacity-50 text-ink text-sm font-semibold px-5 py-2.5 rounded transition-all"
            >
              {saving ? "Submitting..." : "Submit Incident"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }) {
  return (
    <div>
      <h3 className="font-body text-xs font-medium text-faint mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, block }) {
  return (
    <div className={block ? "" : "grid grid-cols-[180px_1fr] gap-3"}>
      <div className="text-sm text-faint">{label}</div>
      <div className={`text-sm text-paper ${block ? "mt-1" : ""}`}>{value || "—"}</div>
    </div>
  );
}
