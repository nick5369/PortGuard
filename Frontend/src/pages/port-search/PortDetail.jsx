import { useEffect } from "react";
import { X, Anchor, Waves, Radio, Ship, Package, Wrench, Fuel, ShieldCheck, Building2 } from "lucide-react";

const BOOL = { Y: "Yes", N: "No", U: "Unknown" };
const BOOL_CLR = { Y: "#16a34a", N: "#dc2626", U: "#6b7280" };
const SIZE = { V: "Very Small", S: "Small", M: "Medium", L: "Large" };
const SIZE_CLR = { L: "#16a34a", M: "#2563eb", S: "#ea580c", V: "#6b7280" };
const TYPE = {
  CB: "Coastal Breakwater", CN: "Coastal Natural", RN: "River Natural",
  RB: "River Basin", OR: "Open Roadstead", LC: "Lake/Canal", TH: "Typhoon Harbor",
};
const SHELTER = { G: "Good", M: "Moderate", P: "Poor", N: "None" };
const REPAIR = { A: "Major", B: "Moderate", C: "Limited", D: "Emergency Only", N: "None" };
const DRY = { L: "Large (>500ft)", M: "Medium (200-500ft)", S: "Small (<200ft)", U: "Unknown", N: "None" };

function Val({ v }) {
  if (v === "Y" || v === "N" || v === "U") {
    return <span style={{ color: BOOL_CLR[v], fontWeight: 700, fontSize: 13 }}>{BOOL[v]}</span>;
  }
  return <span className="ps-d-val">{v || "—"}</span>;
}

function F({ label, value }) {
  return (
    <div className="ps-d-field">
      <span className="ps-d-label">{label}</span>
      <Val v={value} />
    </div>
  );
}

function Sec({ icon: Icon, title, children }) {
  return (
    <div className="ps-d-section">
      <div className="ps-d-sec-head"><Icon size={15} /> {title}</div>
      <div className="ps-d-sec-body">{children}</div>
    </div>
  );
}

export default function PortDetail({ port, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const p = port;

  return (
    <div className="ps-d-overlay" onClick={onClose}>
      <div className="ps-d-panel" onClick={e => e.stopPropagation()}>
        <div className="ps-d-header">
          <div>
            <h2>{p.portName}</h2>
            {p.alternateName && <span className="ps-d-alt">({p.alternateName})</span>}
            <p className="ps-d-sub">{p.countryName} — {p.regionName}</p>
          </div>
          <button className="ps-d-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="ps-d-scroll">
          <div className="ps-d-tags">
            <span className="ps-d-tag">Port #{p.portNumber}</span>
            {p.unloCode && <span className="ps-d-tag">{p.unloCode}</span>}
            <span className="ps-d-tag" style={{ background: SIZE_CLR[p.harborSize] || "#6b7280" }}>
              {SIZE[p.harborSize] || p.harborSize}
            </span>
            {p.navArea && <span className="ps-d-tag">NAVAREA {p.navArea}</span>}
          </div>

          <div className="ps-d-coords">
            <span>{p.latitude}, {p.longitude}</span>
            {p.dodWaterBody && <span className="ps-d-water">{p.dodWaterBody}</span>}
            {p.publicationNumber && <span className="ps-d-pub">{p.publicationNumber}</span>}
          </div>
          <Sec icon={Anchor} title="Physical Characteristics">
            <F label="Harbor Type" value={TYPE[p.harborType] || p.harborType} />
            <F label="Shelter" value={SHELTER[p.shelter] || p.shelter} />
            <F label="Turning Area" value={p.turningArea} />
            <F label="Overhead Limits" value={p.overheadLimits} />
            <F label="Good Holding" value={p.goodHoldingGround} />
            <F label="Entrance Width" value={p.entranceWidth} />
            <F label="Max Length" value={p.maxVesselLength} />
            <F label="Max Beam" value={p.maxVesselBeam} />
            <F label="Max Draft" value={p.maxVesselDraft} />
          </Sec>

          <Sec icon={Waves} title="Depths & Tides">
            <F label="Channel" value={p.chDepth ? `${p.chDepth}m` : null} />
            <F label="Anchorage" value={p.anDepth ? `${p.anDepth}m` : null} />
            <F label="Cargo Pier" value={p.cpDepth ? `${p.cpDepth}m` : null} />
            <F label="Other Terminal" value={p.otDepth ? `${p.otDepth}m` : null} />
            <F label="Tide Range" value={p.tide != null ? `${p.tide}ft` : null} />
            <F label="LNG Depth" value={p.lngTerminalDepth} />
          </Sec>

          <Sec icon={ShieldCheck} title="Entrance Restrictions">
            <F label="Tide" value={p.erTide} />
            <F label="Swell" value={p.erSwell} />
            <F label="Ice" value={p.erIce} />
            <F label="Other" value={p.erOther} />
          </Sec>

          <Sec icon={Ship} title="Pilotage & Tugs">
            <F label="Compulsory" value={p.ptCompulsory} />
            <F label="Advisable" value={p.ptAdvisable} />
            <F label="Available" value={p.ptAvailable} />
            <F label="Local Assist" value={p.ptLocalAssist} />
            <F label="Salvage Tugs" value={p.tugsSalvage} />
            <F label="Assist Tugs" value={p.tugsAssist} />
          </Sec>

          <Sec icon={Radio} title="Communications">
            <F label="Telephone" value={p.cmTelephone} />
            <F label="Telegraph" value={p.cmTelegraph} />
            <F label="Radio" value={p.cmRadio} />
            <F label="Radio Tel" value={p.cmRadioTel} />
            <F label="Air" value={p.cmAir} />
            <F label="Rail" value={p.cmRail} />
          </Sec>

          <Sec icon={Package} title="Loading Facilities">
            <F label="Wharves" value={p.loWharves} />
            <F label="Anchor" value={p.loAnchor} />
            <F label="Med Moor" value={p.loMedMoor} />
            <F label="Beach Moor" value={p.loBeachMoor} />
            <F label="RoRo" value={p.loRoro} />
            <F label="Solid Bulk" value={p.loSolidBulk} />
            <F label="Container" value={p.loContainer} />
            <F label="Break Bulk" value={p.loBreakBulk} />
            <F label="Oil Terminal" value={p.loOilTerm} />
            <F label="Liquid Bulk" value={p.loLiquidBulk} />
            <F label="Dang. Cargo" value={p.loDangCargo} />
            <F label="Long Term" value={p.loLongTerm} />
          </Sec>

          <Sec icon={Building2} title="Cranes & Lifts">
            <F label="Fixed" value={p.crFixed} />
            <F label="Mobile" value={p.crMobile} />
            <F label="Floating" value={p.crFloating} />
            <F label="Container" value={p.cranesContainer} />
            <F label="100+ ton" value={p.lifts100} />
            <F label="50-99 ton" value={p.lifts50} />
            <F label="25-49 ton" value={p.lifts25} />
            <F label="0-24 ton" value={p.lifts0} />
          </Sec>

          <Sec icon={Wrench} title="Services & Repair">
            <F label="Longshore" value={p.srLongshore} />
            <F label="Electrical" value={p.srElectrical} />
            <F label="Steam" value={p.srSteam} />
            <F label="Nav Equip" value={p.srNavigEquip} />
            <F label="Elec Repair" value={p.srElectRepair} />
            <F label="Ice Breaking" value={p.srIceBreaking} />
            <F label="Diving" value={p.srDiving} />
            <F label="Repair Code" value={REPAIR[p.repairCode] || p.repairCode} />
            <F label="Drydock" value={DRY[p.drydock] || p.drydock} />
            <F label="Railway" value={DRY[p.railway] || p.railway} />
          </Sec>

          <Sec icon={Fuel} title="Supplies">
            <F label="Provisions" value={p.suProvisions} />
            <F label="Water" value={p.suWater} />
            <F label="Fuel" value={p.suFuel} />
            <F label="Diesel" value={p.suDiesel} />
            <F label="Deck" value={p.suDeck} />
            <F label="Engine" value={p.suEngine} />
            <F label="Aviation Fuel" value={p.suAviationFuel} />
          </Sec>

          <Sec icon={ShieldCheck} title="Security & Operations">
            <F label="First Port of Entry" value={p.firstPortOfEntry} />
            <F label="US Rep" value={p.usRep} />
            <F label="ETA Message" value={p.etaMessage} />
            <F label="SAR" value={p.searchAndRescue} />
            <F label="TSS" value={p.tss} />
            <F label="VTS" value={p.vts} />
            <F label="UKC Mgmt" value={p.ukcMgmtSystem} />
            <F label="Port Security" value={p.portSecurity} />
            <F label="Pratique" value={p.qtPratique} />
            <F label="Sanitation" value={p.qtSanitation} />
            <F label="Medical" value={p.medFacilities} />
            <F label="Garbage" value={p.garbageDisposal} />
            <F label="Dirty Ballast" value={p.dirtyBallast} />
            <F label="Degauss" value={p.degauss} />
          </Sec>
        </div>
      </div>
    </div>
  );
}
