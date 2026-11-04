// ---------------------------------------------------------------------------
// Muscle reference shown on the exercise guide page
// ---------------------------------------------------------------------------
// Keys are free-exercise-db's muscle vocabulary (primaryMuscles/secondaryMuscles), which every
// library exercise is tagged with (see seedExercisesData.ts). Each entry names the actual
// anatomical muscles behind the everyday label and what they do. A library exercise can narrow
// `anatomy` down for itself via muscle_details (e.g. a lateral raise only hits the side delt).

export type MuscleKey =
  | 'abdominals' | 'abductors' | 'adductors' | 'biceps' | 'calves' | 'chest' | 'forearms'
  | 'glutes' | 'hamstrings' | 'lats' | 'lower back' | 'middle back' | 'neck' | 'quadriceps'
  | 'shoulders' | 'traps' | 'triceps';

export interface MuscleInfo {
  name: string;
  anatomy: string;
  action: string;
}

export const MUSCLE_INFO: Record<MuscleKey, MuscleInfo> = {
  abdominals: {
    name: 'Abs',
    anatomy: 'Rectus abdominis, external and internal obliques, transversus abdominis',
    action: 'Bend and twist the trunk, and brace the spine.',
  },
  abductors: {
    name: 'Hip abductors',
    anatomy: 'Gluteus medius, gluteus minimus, tensor fasciae latae',
    action: 'Move the leg out to the side and keep the pelvis level on one leg.',
  },
  adductors: {
    name: 'Adductors',
    anatomy: 'Adductor magnus, adductor longus, adductor brevis, gracilis, pectineus',
    action: 'Pull the leg in toward the midline; adductor magnus also helps extend the hip.',
  },
  biceps: {
    name: 'Biceps',
    anatomy: 'Biceps brachii (long and short heads), with brachialis and brachioradialis',
    action: 'Bend the elbow and turn the palm up.',
  },
  calves: {
    name: 'Calves',
    anatomy: 'Gastrocnemius, soleus',
    action: 'Raise the heel / point the foot. Soleus does more of the work with the knee bent.',
  },
  chest: {
    name: 'Chest',
    anatomy: 'Pectoralis major (clavicular/upper and sternal/lower heads), pectoralis minor',
    action: 'Push the arms forward and bring them across the body.',
  },
  forearms: {
    name: 'Forearms',
    anatomy: 'Wrist and finger flexors and extensors, brachioradialis',
    action: 'Grip, and bend and straighten the wrist.',
  },
  glutes: {
    name: 'Glutes',
    anatomy: 'Gluteus maximus, with gluteus medius and minimus',
    action: 'Extend the hip (drive it forward) and rotate the thigh outward.',
  },
  hamstrings: {
    name: 'Hamstrings',
    anatomy: 'Biceps femoris (long and short heads), semitendinosus, semimembranosus',
    action: 'Bend the knee and extend the hip.',
  },
  lats: {
    name: 'Lats',
    anatomy: 'Latissimus dorsi, teres major',
    action: 'Pull the arms down and back toward the body.',
  },
  'lower back': {
    name: 'Lower back',
    anatomy: 'Erector spinae (iliocostalis, longissimus, spinalis), multifidus, quadratus lumborum',
    action: 'Straighten the spine and hold it rigid under load.',
  },
  'middle back': {
    name: 'Middle back',
    anatomy: 'Rhomboid major and minor, middle and lower trapezius, infraspinatus, teres minor',
    action: 'Squeeze the shoulder blades together and pull the shoulders back.',
  },
  neck: {
    name: 'Neck',
    anatomy: 'Sternocleidomastoid, splenius capitis, upper trapezius',
    action: 'Bend, straighten and turn the head.',
  },
  quadriceps: {
    name: 'Quads',
    anatomy: 'Rectus femoris, vastus lateralis, vastus medialis, vastus intermedius',
    action: 'Straighten the knee; rectus femoris also lifts the thigh.',
  },
  shoulders: {
    name: 'Shoulders',
    anatomy: 'Deltoid: anterior (front), lateral (side) and posterior (rear) heads',
    action: 'Raise the arm to the front, to the side and behind you.',
  },
  traps: {
    name: 'Traps',
    anatomy: 'Upper trapezius, levator scapulae',
    action: 'Shrug the shoulders and rotate the shoulder blades up when reaching overhead.',
  },
  triceps: {
    name: 'Triceps',
    anatomy: 'Triceps brachii (long, lateral and medial heads)',
    action: 'Straighten the elbow; the long head also pulls the arm down and back.',
  },
};

export function isMuscleKey(value: string): value is MuscleKey {
  return value in MUSCLE_INFO;
}
