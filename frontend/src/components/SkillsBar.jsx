import React from 'react';

export default function SkillsBar({ skills, activeSkills, onToggleSkill }) {
  return (
    <div className="skills-bar">
      <span className="skills-bar-label">Skills</span>
      <div className="skills-row">
        {skills.map((skill) => {
          const active = activeSkills.includes(skill.id);
          return (
            <button
              key={skill.id}
              className={`skill-chip${active ? ' active' : ''}`}
              style={{ '--skill-color': skill.color }}
              onClick={() => onToggleSkill(skill.id)}
              title={skill.description}
            >
              {active && (
                <svg className="skill-chip-check" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 6 5 9 10 3" />
                </svg>
              )}
              {skill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
