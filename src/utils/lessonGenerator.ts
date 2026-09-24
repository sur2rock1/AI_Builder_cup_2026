import { DynamicLessonData } from '../types';

export function createDynamicLesson(topic: string, grade: string): DynamicLessonData {
  const lower = topic.toLowerCase();

  // 1. BIOLOGY: Photosynthesis
  if (lower.includes('photo') || lower.includes('plant') || lower.includes('chlorophyll')) {
    return {
      topic: topic.trim() || 'Photosynthesis',
      grade,
      subject: 'Biology / Life Sciences',
      tagline: 'How Plants Convert Sunlight into Chemical Energy',
      overview:
        'Photosynthesis is the fundamental biological process by which autotrophic organisms (plants and algae) harness sunlight, carbon dioxide (CO₂), and water (H₂O) to synthesize glucose and release oxygen (O₂).',
      diagram: {
        diagramType: 'cycle',
        title: 'Photosynthesis Molecular Cycle & Stages',
        description: 'Trace the path from photon absorption in thylakoids to sugar assembly in the stroma.',
        nodes: [
          {
            id: 'node-light',
            label: 'Solar Photons Absorption',
            sublabel: 'Thylakoid Membrane',
            category: 'Light Reaction',
            color: 'amber',
            details:
              'Chlorophyll pigments absorb blue and red light frequencies, exciting electrons and splitting water (photolysis).',
          },
          {
            id: 'node-water',
            label: 'Water Photolysis (H₂O)',
            sublabel: 'Oxygen Released (O₂)',
            category: 'Reactants',
            color: 'sky',
            details:
              'Water molecules split: 2H₂O → 4H⁺ + 4e⁻ + O₂ gas as a vital byproduct.',
          },
          {
            id: 'node-atp',
            label: 'ATP & NADPH Energy Carriers',
            sublabel: 'Chemical Battery',
            category: 'Energy Transfer',
            color: 'teal',
            details:
              'Proton gradients drive ATP synthase to generate biochemical fuel for the dark reactions.',
          },
          {
            id: 'node-calvin',
            label: 'Calvin Cycle (Dark Reaction)',
            sublabel: 'Stroma Matrix',
            category: 'Carbon Fixation',
            color: 'emerald',
            details:
              'RuBisCO enzyme captures atmospheric CO₂ to assemble 3-carbon sugars.',
          },
          {
            id: 'node-glucose',
            label: 'Glucose Synthesis (C₆H₁₂O₆)',
            sublabel: 'Plant Fuel & Storage',
            category: 'Product',
            color: 'rose',
            details:
              'High-energy glucose molecules form starch for plant growth and cellulose for cell walls.',
          },
        ],
        connections: [
          { from: 'Solar Photons', to: 'Water Photolysis', label: 'Energizes e⁻' },
          { from: 'Water Photolysis', to: 'ATP & NADPH', label: 'H⁺ gradient' },
          { from: 'ATP & NADPH', to: 'Calvin Cycle', label: 'Provides ATP' },
          { from: 'Calvin Cycle', to: 'Glucose Synthesis', label: 'Produces sugar' },
        ],
      },
      chalkNotes: {
        title: 'Photosynthesis Master Equation',
        subtitle: 'The biochemical engine that fuels terrestrial biosphere',
        coreRuleOrFormula: '6 CO₂ + 6 H₂O + Light Energy ➔ C₆H₁₂O₆ + 6 O₂',
        bulletPoints: [
          'Chloroplasts are the cellular solar panels containing chlorophyll a & b pigments.',
          'Light-dependent reactions occur in the thylakoid discs, producing ATP and NADPH.',
          'Light-independent reactions (Calvin cycle) occur in the fluid stroma, fixing CO₂.',
          'Limiting factors: light intensity, carbon dioxide concentration, and ambient temperature.',
        ],
        keyTakeaways: [
          'All oxygen in our atmosphere originates from split water molecules, not CO₂!',
          'Glucose fuels cellular respiration for plant survival during nighttime.',
        ],
      },
      explorer: {
        title: 'Photosynthetic Rate Simulator',
        description:
          'Adjust environmental factors to observe the net oxygen production and glucose synthesis rate.',
        variables: [
          {
            id: 'light_intensity',
            name: 'Light Intensity',
            min: 10,
            max: 100,
            step: 5,
            defaultValue: 65,
            unit: 'µmol/m²/s',
            description: 'Sunlight brightness hitting leaves',
          },
          {
            id: 'co2_conc',
            name: 'CO₂ Concentration',
            min: 200,
            max: 1000,
            step: 50,
            defaultValue: 450,
            unit: 'ppm',
            description: 'Ambient carbon dioxide density',
          },
          {
            id: 'temperature',
            name: 'Ambient Temperature',
            min: 10,
            max: 45,
            step: 1,
            defaultValue: 25,
            unit: '°C',
            description: 'Leaf temperature (affects enzymes)',
          },
        ],
        outcomeLabel: 'Net Photosynthetic Output',
        outcomeFormulaString: 'Rate = min(f(Light), f(CO₂)) × TempFactor',
        calculateOutcome: (vals) => {
          const light = vals.light_intensity ?? 65;
          const co2 = vals.co2_conc ?? 450;
          const temp = vals.temperature ?? 25;

          let tempEfficiency = 1;
          if (temp < 20) tempEfficiency = 0.6 + (temp - 10) * 0.04;
          else if (temp > 35) tempEfficiency = Math.max(0.2, 1 - (temp - 35) * 0.08);

          const rawRate = Math.round(
            Math.min(light * 1.2, co2 * 0.18) * tempEfficiency
          );

          return {
            valueText: `${rawRate} mg O₂ / hr`,
            explanation:
              temp > 35
                ? 'High heat causes RuBisCO and enzymes to denature, reducing rate.'
                : light < 30
                ? 'Light is currently the primary limiting factor.'
                : 'Optimal operating range for balanced glucose and oxygen synthesis.',
            status: temp > 35 ? 'critical' : rawRate > 70 ? 'optimal' : 'normal',
          };
        },
      },
      quiz: {
        question:
          'During photosynthesis, where does the oxygen (O₂) gas released by plants actually come from?',
        options: [
          'From the carbon dioxide (CO₂) absorbed from the air',
          'From water molecules (H₂O) split during the light reaction',
          'From broken-down glucose molecules inside the mitochondria',
          'From soil nitrogen absorbed through the roots',
        ],
        correctIndex: 1,
        explanation:
          'Photolysis splits H₂O into protons, electrons, and O₂ gas. The oxygen in CO₂ gets incorporated into glucose (C₆H₁₂O₆), not released as free gas!',
        hint: 'Think about what molecule gets broken down by solar photons in the thylakoid.',
      },
      suggestedQuestions: [
        'Why do leaves appear green under sunlight?',
        'What happens to photosynthesis at night?',
        'Can plants do photosynthesis without water?',
        'What is the difference between light and dark reactions?',
      ],
    };
  }

  // 2. PHYSICS: Newton's Laws of Motion
  if (lower.includes('newton') || lower.includes('motion') || lower.includes('force') || lower.includes('gravity')) {
    return {
      topic: topic.trim() || "Newton's Laws of Motion",
      grade,
      subject: 'Physics / Mechanics',
      tagline: 'The Principles Governing Forces, Mass, and Acceleration',
      overview:
        "Sir Isaac Newton's three laws of motion describe the relationship between the forces acting on a body and its motion due to those forces, forming the bedrock of classical mechanics.",
      diagram: {
        diagramType: 'nodes',
        title: "Newton's 3 Pillars of Classical Mechanics",
        description: 'Explore inertia, acceleration dynamics, and reciprocal force interactions.',
        nodes: [
          {
            id: 'law-1',
            label: '1st Law: Law of Inertia',
            sublabel: 'Net Force = 0',
            category: 'Inertia',
            color: 'sky',
            details:
              'An object remains at rest, or continues at a constant velocity, unless acted upon by a net external force.',
          },
          {
            id: 'law-2',
            label: '2nd Law: F = m · a',
            sublabel: 'Force & Acceleration',
            category: 'Dynamics',
            color: 'amber',
            details:
              'The acceleration of an object is directly proportional to net force and inversely proportional to mass.',
          },
          {
            id: 'law-3',
            label: '3rd Law: Action & Reaction',
            sublabel: 'F_A on B = - F_B on A',
            category: 'Interactions',
            color: 'rose',
            details:
              'When one body exerts a force on a second body, the second body simultaneously exerts an equal and opposite force.',
          },
          {
            id: 'app-momentum',
            label: 'Conservation of Momentum',
            sublabel: 'p = m · v',
            category: 'Derivation',
            color: 'teal',
            details:
              'In an isolated system without external forces, total momentum remains strictly conserved during collisions.',
          },
          {
            id: 'app-gravity',
            label: 'Gravitational Weight (W = mg)',
            sublabel: 'Universal Attraction',
            category: 'Application',
            color: 'emerald',
            details:
              'Mass is intrinsic quantity of matter; weight is the downward force exerted by local gravity.',
          },
        ],
        connections: [
          { from: '1st Law: Law of Inertia', to: '2nd Law: F = m · a', label: 'Generalizes' },
          { from: '2nd Law: F = m · a', to: '3rd Law: Action & Reaction', label: 'Pairs with' },
          { from: '3rd Law: Action & Reaction', to: 'Conservation of Momentum', label: 'Proves' },
        ],
      },
      chalkNotes: {
        title: 'Equations of Force & Motion',
        subtitle: 'Foundations of Rocketry, Automotive Safety, and Space Travel',
        coreRuleOrFormula: 'Net Force (ΣF) = Mass (m) × Acceleration (a)',
        bulletPoints: [
          'Mass (kg) measures resistance to change in velocity (inertia).',
          'Acceleration (m/s²) is the rate of change of velocity over time: a = Δv / Δt.',
          'Action-reaction force pairs act on TWO DIFFERENT objects, which is why they never cancel each other out!',
          'Friction and air resistance are opposing forces that reduce net acceleration.',
        ],
        keyTakeaways: [
          'Heavier objects require proportionally greater force to accelerate at the same rate.',
          'Rockets fly in the vacuum of space by pushing exhaust gas backward (Newton’s 3rd Law)!',
        ],
      },
      explorer: {
        title: 'Newtonian Acceleration Lab',
        description: 'Test Newton’s 2nd Law (F = m · a) by varying applied force and mass.',
        variables: [
          {
            id: 'force',
            name: 'Applied Force (F)',
            min: 10,
            max: 500,
            step: 10,
            defaultValue: 150,
            unit: 'Newtons (N)',
            description: 'Pusher force applied to cart',
          },
          {
            id: 'mass',
            name: 'Object Mass (m)',
            min: 5,
            max: 100,
            step: 5,
            defaultValue: 25,
            unit: 'kg',
            description: 'Inertial weight of the vehicle',
          },
          {
            id: 'friction',
            name: 'Friction Coefficient (μ)',
            min: 0,
            max: 0.8,
            step: 0.05,
            defaultValue: 0.15,
            unit: 'μ',
            description: 'Surface resistance against motion',
          },
        ],
        outcomeLabel: 'Resulting Acceleration (a)',
        outcomeFormulaString: 'a = (F_applied - μ · m · g) / m',
        calculateOutcome: (vals) => {
          const F = vals.force ?? 150;
          const m = vals.mass ?? 25;
          const mu = vals.friction ?? 0.15;
          const fFriction = mu * m * 9.81;
          const netF = Math.max(0, F - fFriction);
          const accel = (netF / m).toFixed(2);

          return {
            valueText: `${accel} m/s²`,
            explanation:
              netF === 0
                ? 'Applied force cannot overcome static friction; object stays at rest.'
                : `Net force of ${netF.toFixed(1)} N accelerates the ${m} kg body at ${accel} m/s².`,
            status: netF === 0 ? 'critical' : 'optimal',
          };
        },
      },
      quiz: {
        question:
          'A massive truck collides head-on with a tiny mosquito. According to Newton’s 3rd Law, which statement is strictly true?',
        options: [
          'The truck exerts a much greater force on the mosquito than the mosquito does on the truck',
          'The mosquito exerts an equal magnitude of force on the truck as the truck exerts on the mosquito',
          'The mosquito exerts zero force because its mass is negligible',
          'Forces only balance out if both objects have identical velocities',
        ],
        correctIndex: 1,
        explanation:
          'Newton’s 3rd Law states action and reaction forces are strictly EQUAL in magnitude and OPPOSITE in direction! The mosquito experiences massive acceleration because of its tiny mass (a = F/m).',
        hint: 'Separate the concept of Force (which is equal) from Acceleration (which depends on mass).',
      },
      suggestedQuestions: [
        'Why don’t action and reaction forces cancel each other out?',
        'What would happen if friction disappeared completely?',
        'How does a rocket accelerate in the vacuum of space with nothing to push against?',
        'What is the difference between mass and weight on the Moon?',
      ],
    };
  }

  // 3. HISTORY: World War I or General History
  if (lower.includes('war') || lower.includes('revolution') || lower.includes('history') || lower.includes('empire')) {
    return {
      topic: topic.trim() || 'The Causes of World War I',
      grade,
      subject: 'History / Social Studies',
      tagline: 'Militarism, Alliances, Imperialism, and the Spark of 1914',
      overview:
        'The outbreak of World War I in 1914 was ignited by deep systemic tensions across Europe, commonly summarized by the M-A-I-N acronym, culminating in the assassination of Archduke Franz Ferdinand in Sarajevo.',
      diagram: {
        diagramType: 'flow',
        title: 'The M-A-I-N Causes & Escalation Chain',
        description: 'Examine how interconnected alliances turned a regional conflict into a global war.',
        nodes: [
          {
            id: 'hist-m',
            label: 'Militarism',
            sublabel: 'Arms Race & Dreadnoughts',
            category: 'Systemic Factor',
            color: 'rose',
            details:
              'Massive expansion of standing armies and naval rivalry between Great Britain and Imperial Germany.',
          },
          {
            id: 'hist-a',
            label: 'Alliances Network',
            sublabel: 'Triple Entente vs Central Powers',
            category: 'Diplomatic Web',
            color: 'amber',
            details:
              'Secret and defensive pacts bound European powers to automatically declare war if an ally was attacked.',
          },
          {
            id: 'hist-i',
            label: 'Imperialism',
            sublabel: 'Scramble for Africa & Global Markets',
            category: 'Economic Tension',
            color: 'teal',
            details:
              'Fierce colonial competition across Africa and Asia fueled persistent suspicion and disputes.',
          },
          {
            id: 'hist-n',
            label: 'Nationalism',
            sublabel: 'Pan-Slavism & Balkan Powder Keg',
            category: 'Ideology',
            color: 'violet',
            details:
              'Intense national pride and Slavic independence movements challenged the Austro-Hungarian Empire.',
          },
          {
            id: 'hist-spark',
            label: 'The Sarajevo Spark (June 28, 1914)',
            sublabel: 'Gavrilo Princip & Black Hand',
            category: 'Immediate Trigger',
            color: 'emerald',
            details:
              'Assassination of Austrian Archduke Franz Ferdinand triggered the July Crisis and rapid mobilization.',
          },
        ],
        connections: [
          { from: 'Militarism', to: 'Alliances Network', label: 'Escalates readiness' },
          { from: 'Imperialism', to: 'Nationalism', label: 'Breeds rivalry' },
          { from: 'Nationalism', to: 'The Sarajevo Spark', label: 'Direct motivation' },
          { from: 'The Sarajevo Spark', to: 'Alliances Network', label: 'Triggers domino mobilization' },
        ],
      },
      chalkNotes: {
        title: 'The Road to Global Conflict: 1914',
        subtitle: 'How diplomatic failure and rigid mobilization timetables engulfed Europe',
        coreRuleOrFormula: 'M-A-I-N: Militarism + Alliances + Imperialism + Nationalism',
        bulletPoints: [
          'The Triple Entente (Britain, France, Russia) confronted the Central Powers (Germany, Austria-Hungary, Ottoman Empire).',
          'The Balkan peninsula was known as the "Powder Keg of Europe" due to ethnic and territorial rivalries.',
          'Germany offered Austria-Hungary a "blank check" of unconditional support following the Sarajevo assassination.',
          'The Schlieffen Plan required Germany to rapidly invade France via neutral Belgium, drawing Great Britain into the war.',
        ],
        keyTakeaways: [
          'Rigid railway mobilization schedules meant that once armies began mobilizing, diplomacy could not stop the war.',
          'Industrial warfare (machine guns, artillery, chemical gas) resulted in stalemate and trench warfare.',
        ],
      },
      explorer: {
        title: 'Geopolitical Tension Simulator',
        description: 'Simulate how varying alliance rigidity and colonial tension affect war risk.',
        variables: [
          {
            id: 'alliance_rigidity',
            name: 'Alliance Treaty Rigidity',
            min: 10,
            max: 100,
            step: 10,
            defaultValue: 80,
            unit: '%',
            description: 'Commitment level to join ally in war',
          },
          {
            id: 'arms_spending',
            name: 'Naval & Army Spending',
            min: 10,
            max: 100,
            step: 5,
            defaultValue: 75,
            unit: 'index',
            description: 'Militaristic stockpiles and conscription',
          },
          {
            id: 'diplomatic_cushion',
            name: 'Diplomatic Buffer',
            min: 0,
            max: 100,
            step: 10,
            defaultValue: 20,
            unit: '%',
            description: 'Buffer time before mobilization begins',
          },
        ],
        outcomeLabel: 'Escalation Probability',
        outcomeFormulaString: 'Risk = (Alliances + Arms - Buffer) / 2',
        calculateOutcome: (vals) => {
          const a = vals.alliance_rigidity ?? 80;
          const m = vals.arms_spending ?? 75;
          const d = vals.diplomatic_cushion ?? 20;

          const score = Math.min(100, Math.max(0, Math.round((a * 0.5 + m * 0.5) - d * 0.3)));

          return {
            valueText: `${score}% Imminent War Risk`,
            explanation:
              score > 70
                ? 'Hyper-escalation threshold exceeded: Any local spark will trigger continent-wide continental mobilization.'
                : 'Tensions manageable through multilateral diplomatic arbitration.',
            status: score > 70 ? 'critical' : 'normal',
          };
        },
      },
      quiz: {
        question:
          'Why did Great Britain officially enter World War I on August 4, 1914?',
        options: [
          'Because a British passenger ship was immediately torpedoed in the English Channel',
          'Because Imperial Germany violated Belgian neutrality under the 1839 Treaty of London',
          'Because Russia offered to transfer colonial territories to Great Britain',
          'Because the United States requested British assistance in the Atlantic',
        ],
        correctIndex: 1,
        explanation:
          'Under the 1839 Treaty of London, Britain guaranteed the neutrality and independence of Belgium. When German forces invaded Belgium to enact the Schlieffen Plan, Britain declared war.',
        hint: 'Consider the geographical shortcut Germany took to bypass French border fortresses.',
      },
      suggestedQuestions: [
        'What was the Schlieffen Plan and why did it fail?',
        'Why was the Balkan peninsula called the powder keg of Europe?',
        'How did trench warfare develop on the Western Front?',
        'What role did the Russian Revolution of 1917 play in WWI?',
      ],
    };
  }

  // 4. GEOMETRY: Bisectors, perpendiculars, polygons, circles, congruence, proofs
  if (
    lower.includes('bisect') || lower.includes('perpendicular') || lower.includes('parallel') ||
    lower.includes('polygon') || lower.includes('triangle') || lower.includes('circle') ||
    lower.includes('chord') || lower.includes('arc') || lower.includes('tangent') ||
    lower.includes('congruent') || lower.includes('similar') || lower.includes('locus') ||
    lower.includes('angle') || lower.includes('proof') || lower.includes('geometry') ||
    lower.includes('quadrilateral') || lower.includes('square') || lower.includes('rectangle') ||
    lower.includes('rhombus') || lower.includes('trapezium') || lower.includes('trapezoid')
  ) {
    const isBisector   = lower.includes('bisect') || lower.includes('perpendicular');
    const isCircle     = lower.includes('circle') || lower.includes('arc') || lower.includes('chord') || lower.includes('tangent');
    const isAngle      = lower.includes('angle') && !isBisector;

    const diagramTitle = isBisector
      ? 'Perpendicular & Angle Bisectors'
      : isCircle
        ? 'Circle Geometry: Chords, Arcs & Tangents'
        : isAngle
          ? 'Angle Relationships & Properties'
          : `Geometry: ${topic}`;

    return {
      topic: topic.trim(),
      grade,
      subject: 'Mathematics / Geometry',
      tagline: isBisector
        ? 'Lines that Divide Equally — and the Locus of Equidistant Points'
        : isCircle
          ? 'The Circle as a Set of Points Equidistant from the Centre'
          : 'Shapes, Angles, and Proofs in Euclidean Space',
      overview: isBisector
        ? 'A perpendicular bisector of a line segment AB passes through its midpoint at 90°. Every point on this bisector is equidistant from A and B. An angle bisector divides an angle into two equal halves; every point on it is equidistant from both arms.'
        : isCircle
          ? 'A circle is the locus of all points equidistant from a fixed centre. Chords, arcs, tangents and their angle/length relationships form the foundation of circle geometry.'
          : `Exploring the properties of angles, shapes, and geometric proofs relevant to ${topic}.`,
      diagram: {
        diagramType: 'flow',
        title: diagramTitle,
        description: isBisector
          ? 'Key constructions and the equidistance property of bisectors'
          : isCircle
            ? 'Relationships between circles, chords, tangents and arcs'
            : 'Core geometric relationships and properties',
        nodes: isBisector ? [
          {
            id: 'geo-segment',
            label: 'Line Segment AB',
            sublabel: 'Given line of known length',
            category: 'Starting Object',
            color: 'sky',
            details: 'AB is the line segment we want to bisect. Its endpoints A and B are fixed.',
          },
          {
            id: 'geo-midpoint',
            label: 'Midpoint M',
            sublabel: 'AM = MB',
            category: 'Construction Point',
            color: 'amber',
            details: 'M is the exact midpoint of AB. The bisector always passes through M.',
          },
          {
            id: 'geo-bisector',
            label: 'Perpendicular Bisector',
            sublabel: '90° at M — infinite line',
            category: 'Bisector Line',
            color: 'emerald',
            details: 'The perpendicular bisector is a line through M at right angles to AB. It extends in both directions.',
          },
          {
            id: 'geo-locus',
            label: 'Equidistant Locus',
            sublabel: 'PA = PB for any P on bisector',
            category: 'Key Property',
            color: 'rose',
            details: 'Every point P on the perpendicular bisector is exactly the same distance from A as it is from B. This is the locus definition.',
          },
          {
            id: 'geo-compass',
            label: 'Compass Construction',
            sublabel: 'Arc method to draw bisector',
            category: 'Construction Method',
            color: 'violet',
            details: 'Set compass > ½AB. Draw arcs from A and B. Their intersection points define the perpendicular bisector line.',
          },
        ] : isCircle ? [
          {
            id: 'circle-centre',
            label: 'Centre O',
            sublabel: 'Fixed equidistant point',
            category: 'Defining Point',
            color: 'amber',
            details: 'Every point on the circle is exactly radius r from O. O is equidistant from all points on the circumference.',
          },
          {
            id: 'circle-chord',
            label: 'Chord',
            sublabel: 'Line joining two circle points',
            category: 'Line Segment',
            color: 'sky',
            details: 'A chord joins two points on the circle. The perpendicular from the centre to a chord bisects it.',
          },
          {
            id: 'circle-arc',
            label: 'Arc',
            sublabel: 'Part of the circumference',
            category: 'Curve Segment',
            color: 'emerald',
            details: "An arc is a portion of the circle's boundary. Equal chords subtend equal arcs.",
          },
          {
            id: 'circle-tangent',
            label: 'Tangent',
            sublabel: 'Touches circle at 1 point, 90° to radius',
            category: 'External Line',
            color: 'rose',
            details: 'A tangent touches the circle at exactly one point and is perpendicular to the radius at that point.',
          },
        ] : [
          {
            id: 'geo-angle-types',
            label: 'Angle Types',
            sublabel: 'Acute, right, obtuse, reflex',
            category: 'Classification',
            color: 'sky',
            details: 'Angles are classified by their measure: acute (<90°), right (=90°), obtuse (90°–180°), reflex (>180°).',
          },
          {
            id: 'geo-angle-pairs',
            label: 'Angle Pairs',
            sublabel: 'Complementary, supplementary, vertically opposite',
            category: 'Relationships',
            color: 'emerald',
            details: 'Complementary angles sum to 90°; supplementary to 180°. Vertically opposite angles are equal.',
          },
          {
            id: 'geo-parallel',
            label: 'Parallel Lines & Transversal',
            sublabel: 'Alternate, co-interior, corresponding angles',
            category: 'Parallel Properties',
            color: 'amber',
            details: 'When a transversal crosses parallel lines, alternate angles are equal, corresponding angles are equal, co-interior angles sum to 180°.',
          },
          {
            id: 'geo-proof',
            label: 'Geometric Proof',
            sublabel: 'Given → Construct → Prove',
            category: 'Reasoning Method',
            color: 'violet',
            details: 'A proof starts from given facts, uses known properties step by step, and arrives at the conclusion to be proved.',
          },
        ],
        connections: isBisector ? [
          { from: 'Line Segment AB', to: 'Midpoint M', label: 'locate centre' },
          { from: 'Midpoint M', to: 'Perpendicular Bisector', label: 'draw 90° through' },
          { from: 'Perpendicular Bisector', to: 'Equidistant Locus', label: 'defines' },
          { from: 'Compass Construction', to: 'Perpendicular Bisector', label: 'constructs' },
        ] : isCircle ? [
          { from: 'Centre O', to: 'Chord', label: 'perp. bisects' },
          { from: 'Chord', to: 'Arc', label: 'subtends' },
          { from: 'Centre O', to: 'Tangent', label: 'radius ⊥ tangent' },
        ] : [
          { from: 'Angle Types', to: 'Angle Pairs', label: 'combine into' },
          { from: 'Angle Pairs', to: 'Parallel Lines & Transversal', label: 'apply to' },
          { from: 'Parallel Lines & Transversal', to: 'Geometric Proof', label: 'evidence in' },
        ],
      },
      chalkNotes: {
        title: isBisector ? 'Bisector Key Facts' : isCircle ? 'Circle Geometry Rules' : 'Angle & Shape Properties',
        subtitle: `${grade} — Geometry`,
        coreRuleOrFormula: isBisector
          ? 'Perpendicular bisector of AB: passes through midpoint M at 90°; PA = PB for all P on bisector'
          : isCircle
            ? 'Tangent ⊥ radius at point of contact; Perpendicular from centre bisects chord'
            : 'Angles on a straight line = 180°; Angles around a point = 360°',
        bulletPoints: isBisector ? [
          'Perpendicular bisector cuts a segment into two equal halves at 90°.',
          'Any point on the bisector is equidistant from both endpoints.',
          'Angle bisector splits an angle into two equal angles.',
          'Use compass arcs from both endpoints to construct the bisector.',
        ] : isCircle ? [
          'All radii of a circle are equal.',
          'The perpendicular from centre to a chord bisects that chord.',
          'Angles in the same segment are equal.',
          'Tangent to a circle is perpendicular to the radius at the point of contact.',
        ] : [
          'Complementary angles sum to 90°; supplementary angles sum to 180°.',
          'Vertically opposite angles are always equal.',
          'Corresponding, alternate and co-interior angles apply when a transversal cuts parallel lines.',
          'Always state the geometric reason in a proof (e.g. "alternate angles, AB ∥ CD").',
        ],
        keyTakeaways: isBisector ? [
          'The perpendicular bisector is the LOCUS of all equidistant points from A and B.',
          'To construct: compass radius > ½AB, arcs from both endpoints, join intersections.',
        ] : isCircle ? [
          'The centre-chord-perpendicular relationship is the foundation of many circle proofs.',
          'Always draw a radius to a tangent point when solving tangent problems.',
        ] : [
          'Name every angle relationship you use — unsupported claims score zero in proofs.',
          'Parallel line angle rules only apply when lines are confirmed parallel.',
        ],
      },
      explorer: {
        title: isBisector ? 'Bisector Construction Simulator' : isCircle ? 'Circle Geometry Explorer' : 'Angle Relationships Explorer',
        description: isBisector
          ? 'Adjust the length of segment AB and watch how the perpendicular bisector and equidistance arcs change.'
          : isCircle
            ? 'Move a chord and observe how the perpendicular from centre always bisects it.'
            : 'Adjust angles formed by a transversal cutting parallel lines and observe the relationships.',
        variables: [
          {
            id: 'var_length',
            name: isBisector ? 'Segment Length (AB)' : isCircle ? 'Radius' : 'Angle α',
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 50,
            unit: isBisector ? 'cm' : isCircle ? 'cm' : '°',
            description: isBisector
              ? 'Length of the line segment to bisect'
              : isCircle
                ? 'Radius of the circle'
                : 'Measure of the first angle',
          },
        ],
        outcomeLabel: isBisector ? 'Half-length AM (cm)' : isCircle ? 'Chord length (cm)' : 'Supplementary angle (°)',
        outcomeFormulaString: isBisector ? 'AM = MB = AB ÷ 2' : isCircle ? 'chord = 2 × √(r² − d²)' : 'α + β = 180°',
        calculateOutcome: (vals: Record<string, number>) => ({
          valueText: isBisector
            ? `${(vals['var_length'] / 2).toFixed(1)} cm`
            : isCircle
              ? `${(2 * Math.sqrt(Math.max(0, vals['var_length'] ** 2 - 25))).toFixed(1)} cm`
              : `${(180 - vals['var_length']).toFixed(0)}°`,
          explanation: isBisector
            ? 'The midpoint divides the segment into two equal halves.'
            : isCircle
              ? 'Using the formula: chord = 2√(r² − d²).'
              : 'Supplementary angles add up to 180°.',
          status: 'normal' as const,
        }),
      },
      quiz: {
        question: isBisector
          ? 'Point P lies on the perpendicular bisector of segment AB. What can you conclude?'
          : isCircle
            ? 'A tangent meets a circle at point T, and OT is the radius. What is the angle between OT and the tangent?'
            : 'Two parallel lines are cut by a transversal. The co-interior angles are x and (x + 40)°. Find x.',
        options: isBisector
          ? ['PA = PB (equidistant from A and B)', 'PA = AB', 'P is the midpoint of AB', 'P is on AB']
          : isCircle
            ? ['90°', '45°', '60°', '180°']
            : ['70°', '80°', '110°', '40°'],
        correctIndex: 0,
        explanation: isBisector
          ? 'Every point on the perpendicular bisector of AB is equidistant from both endpoints A and B. This is the defining property (locus) of the perpendicular bisector.'
          : isCircle
            ? 'A tangent to a circle is always perpendicular to the radius drawn to the point of tangency. The angle is always 90°.'
            : 'Co-interior angles sum to 180°, so x + (x + 40) = 180 → 2x + 40 = 180 → x = 70°.',
      },
      suggestedQuestions: isBisector
        ? [
          'How do you construct a perpendicular bisector with a compass?',
          'Why is every point on the bisector equidistant from the endpoints?',
          'What is the difference between a perpendicular bisector and an angle bisector?',
        ]
        : isCircle
          ? [
            'Why is a tangent always perpendicular to the radius?',
            'What does the perpendicular from the centre to a chord tell us?',
            'How does the angle at the centre relate to the angle at the circumference?',
          ]
          : [
            'What is the difference between parallel and perpendicular lines?',
            'How do co-interior and alternate angles differ?',
            'Can an angle bisector also be a perpendicular bisector?',
          ],
      scene3d: {
        sceneType: 'geometry' as const,
        title: isBisector ? 'Bisector Construction' : isCircle ? 'Circle Geometry' : 'Angle Relationships',
        description: isBisector
          ? 'Visualise how the perpendicular bisector creates a locus of equidistant points.'
          : isCircle
            ? 'Explore chord, tangent and arc relationships in a circle.'
            : 'See how angles are formed by parallel lines and a transversal.',
        elements: [
          { name: 'Line Segment', description: 'The baseline being bisected', color: '#34d399' },
          { name: 'Bisector', description: 'The dividing line', color: '#60a5fa' },
          { name: 'Equal Parts', description: 'Demonstrating equality', color: '#f59e0b' },
        ],
      },
      photoVisual: {
        caption: isBisector
          ? 'A real compass-and-ruler construction showing the perpendicular bisector in action'
          : isCircle
            ? 'A tangent line touching a wheel — demonstrating the 90° rule at the contact point'
            : 'Road lane markings showing parallel lines cut by a transversal',
        promptUsed: isBisector
          ? 'Photorealistic compass-and-ruler construction on graph paper showing perpendicular bisector'
          : isCircle
            ? 'Photorealistic bicycle wheel with a tangent line marked at the tyre contact point'
            : 'Aerial photograph of parallel road lanes with a diagonal crossroad',
        annotations: [
          { label: 'Key Point', description: 'The critical geometric relationship', x: 50, y: 50 },
        ],
      },
    };
  }

  // 5. GENERAL DYNAMIC FALLBACK (Handles ANY arbitrary subject/topic entered by the student!)
  const capitalizedTopic = topic.charAt(0).toUpperCase() + topic.slice(1);

  return {
    topic: capitalizedTopic,
    grade,
    subject: 'Interdisciplinary Inquiry',
    tagline: `Fundamental Principles, Structures, and Core Concepts of ${capitalizedTopic}`,
    overview: `An in-depth, structured conceptual masterclass on ${capitalizedTopic} tailored specifically for ${grade} students, exploring core definitions, practical mechanisms, and critical reasoning.`,
    diagram: {
      diagramType: 'nodes',
      title: `Conceptual Architecture: ${capitalizedTopic}`,
      description: `Core structural components, causal links, and foundational laws of ${capitalizedTopic}.`,
      nodes: [
        {
          id: 'concept-foundations',
          label: 'First Principles & Axioms',
          sublabel: 'Foundational Theory',
          category: 'Axiomatic Basis',
          color: 'emerald',
          details: `The core governing axiom, initial physical assumptions, and foundational definitions of ${capitalizedTopic}.`,
        },
        {
          id: 'concept-mechanism',
          label: 'Core Operational Mechanism',
          sublabel: 'Dynamic Process',
          category: 'Causal Engine',
          color: 'amber',
          details: `The step-by-step physical, mathematical, or systemic operations driving ${capitalizedTopic}.`,
        },
        {
          id: 'concept-variables',
          label: 'Critical System Variables',
          sublabel: 'Governing Inputs',
          category: 'Equilibrium Factors',
          color: 'sky',
          details: `The critical parameters that determine rate, magnitude, behavior, and systemic stability.`,
        },
        {
          id: 'concept-applications',
          label: 'Empirical Applications',
          sublabel: 'Observable Impact',
          category: 'Real-World Manifestation',
          color: 'teal',
          details: `Direct manifestations in modern science, technological engineering, and natural phenomena.`,
        },
        {
          id: 'concept-synthesis',
          label: 'Systemic Synthesis & Mastery',
          sublabel: 'Unified Framework',
          category: 'Conceptual Model',
          color: 'rose',
          details: `Synthesizing components into a unified mental model for deep understanding and predictive mastery.`,
        },
      ],
      connections: [
        { from: 'First Principles & Axioms', to: 'Core Operational Mechanism', label: 'Establishes' },
        { from: 'Core Operational Mechanism', to: 'Critical System Variables', label: 'Regulated by' },
        { from: 'Critical System Variables', to: 'Empirical Applications', label: 'Manifests in' },
        { from: 'Empirical Applications', to: 'Systemic Synthesis & Mastery', label: 'Synthesizes into' },
      ],
    },
    chalkNotes: {
      title: `Mastery Notes: ${capitalizedTopic}`,
      subtitle: `Essential chalkboard concepts, formulas, and insights for ${grade}`,
      coreRuleOrFormula: `Golden Axiom of ${capitalizedTopic}: Input Variables ➔ Structured Process ➔ Quantifiable Outcome`,
      bulletPoints: [
        `Core Definition: ${capitalizedTopic} represents a fundamental concept studied across ${grade} curricula.`,
        `Mechanisms: Understanding cause-and-effect relationships and underlying physical/conceptual frameworks.`,
        `Common Student Pitfall: Confusing surface-level terminology with deep functional understanding.`,
        `Problem-Solving Heuristic: Break down complex problems into elemental first principles before calculating or concluding.`,
      ],
      keyTakeaways: [
        `Always verify initial conditions and assumptions before applying rules.`,
        `Relate abstract concepts to observable real-world phenomena for maximum retention.`,
      ],
    },
    explorer: {
      title: `${capitalizedTopic} Parameter Sandbox`,
      description: `Explore how adjusting critical inputs alters systemic equilibrium and outcome metrics.`,
      variables: [
        {
          id: 'input_scale',
          name: 'Input Intensity / Scale',
          min: 1,
          max: 100,
          step: 1,
          defaultValue: 50,
          unit: '%',
          description: 'Primary input magnitude or effort',
        },
        {
          id: 'efficiency',
          name: 'System Efficiency Factor',
          min: 10,
          max: 100,
          step: 5,
          defaultValue: 80,
          unit: '%',
          description: 'Conversion rate or resistance factor',
        },
        {
          id: 'complexity',
          name: 'Environmental Complexity',
          min: 1,
          max: 10,
          step: 1,
          defaultValue: 4,
          unit: 'tier',
          description: 'Degree of external variability',
        },
      ],
      outcomeLabel: 'Predicted System Performance',
      outcomeFormulaString: 'Score = (Scale × Efficiency) / Complexity',
      calculateOutcome: (vals) => {
        const scale = vals.input_scale ?? 50;
        const eff = vals.efficiency ?? 80;
        const comp = vals.complexity ?? 4;
        const score = Math.round((scale * (eff / 100)) / (comp * 0.25));

        return {
          valueText: `${score} Efficiency Index`,
          explanation:
            score > 100
              ? 'Optimal operating threshold: Highly efficient conversion of inputs into intended outputs.'
              : 'Sub-optimal throughput: Check input scaling or reduce environmental friction.',
          status: score > 100 ? 'optimal' : 'normal',
        };
      },
    },
    quiz: {
      question: `Which approach represents the most scientifically rigorous way to analyze a problem in ${capitalizedTopic}?`,
      options: [
        'Memorizing answers without understanding the underlying mechanisms',
        'Deconstructing the system into first principles and testing causal relationships',
        'Assuming all variables remain constant regardless of environmental changes',
        'Relying solely on intuition without validating mathematical or empirical evidence',
      ],
      correctIndex: 1,
      explanation:
        'First-principles thinking allows you to break down complex phenomena into their most basic foundational truths and reason upwards, rather than reasoning by analogy.',
      hint: 'Look for the option that emphasizes empirical testing and fundamental truths.',
    },
    suggestedQuestions: [
      `What is the most common misconception about ${capitalizedTopic}?`,
      `How does ${capitalizedTopic} apply to everyday modern life?`,
      `Can you give me a simple real-world analogy?`,
      `What should I focus on to excel in this topic on an exam?`,
    ],
    scene3d: {
      sceneType:
        capitalizedTopic.toLowerCase().includes('orbit') || capitalizedTopic.toLowerCase().includes('space')
          ? 'orbit'
          : capitalizedTopic.toLowerCase().includes('dna') || capitalizedTopic.toLowerCase().includes('cell')
          ? 'dna'
          : capitalizedTopic.toLowerCase().includes('atom') || capitalizedTopic.toLowerCase().includes('molecule')
          ? 'molecule'
          : capitalizedTopic.toLowerCase().includes('history') || capitalizedTopic.toLowerCase().includes('war')
          ? 'globe'
          : capitalizedTopic.toLowerCase().includes('math') || capitalizedTopic.toLowerCase().includes('geometry')
          ? 'geometry'
          : 'network',
      title: `3D Spatial Visualization: ${capitalizedTopic}`,
      description: `Interactive three-dimensional dynamic model demonstrating spatial geometry and structural relationships for ${capitalizedTopic}.`,
      elements: [
        { name: 'Core Nucleus', description: 'Central anchor point of the system', color: '#fbbf24' },
        { name: 'Primary Matrix', description: 'Surrounding structural coordinates and relations', color: '#38bdf8' },
        { name: 'Equilibrium Field', description: 'Balancing forces and interactions', color: '#34d399' },
      ],
    },
    photoVisual: {
      caption: `Empirical Photographic & Observational Study: ${capitalizedTopic}`,
      promptUsed: `Scientific, high-definition photorealistic depiction of ${capitalizedTopic} showcasing real-world empirical scale and natural details.`,
      annotations: [
        { label: 'Primary Feature', description: `Key observable attribute of ${capitalizedTopic}`, x: 35, y: 45 },
        { label: 'Environmental Interaction', description: `Boundary interaction with surrounding conditions`, x: 65, y: 60 },
      ],
    },
  };
}
