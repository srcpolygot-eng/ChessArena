export interface OpeningInfo {
  eco: string;
  name: string;
}

export interface OpeningCatalogEntry extends OpeningInfo {
  moves: string[];
  category: '1.e4' | '1.d4' | 'Flank';
  idea: string;
}

const OPENINGS: OpeningCatalogEntry[] = [
  // Famous quick checkmates & traps
  { eco: 'C20', name: "Scholar's Mate", moves: ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'], category: '1.e4', idea: 'Classic four-move tactical checkmate targeting the vulnerable f7 square.' },
  { eco: 'A02', name: "Fool's Mate", moves: ['f3', 'e5', 'g4', 'Qh4#'], category: 'Flank', idea: 'The fastest possible checkmate exploiting a weakened e1-h4 diagonal.' },

  // King's Pawn Openings (C & B)
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], category: '1.e4', idea: 'Ultra-solid grandmaster defense counterattacking e4 and aiming for a resilient endgame.' },
  { eco: 'C78', name: 'Ruy Lopez: Morphy Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'], category: '1.e4', idea: 'Mainline Spanish battle combining long-term central pressure with rich piece play.' },
  { eco: 'C68', name: 'Ruy Lopez: Exchange Variation', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], category: '1.e4', idea: 'White trades bishop for knight early to damage Black’s queenside pawn structure.' },
  { eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], category: '1.e4', idea: 'Pressures the knight defending e5 while preparing rapid kingside castling.' },
  { eco: 'C58', name: 'Italian Game: Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'], category: '1.e4', idea: 'Sharp tactical assault on f7 that leads to immediate complications.' },
  { eco: 'C55', name: 'Italian Game: Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], category: '1.e4', idea: 'Active counterattack against White’s e4 pawn while developing rapidly.' },
  { eco: 'C53', name: 'Italian Game: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], category: '1.e4', idea: 'Classical central expansion preparing d4 and a balanced middlegame.' },
  { eco: 'C51', name: 'Italian Game: Evans Gambit', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], category: '1.e4', idea: 'Romantic pawn sacrifice gaining rapid tempo, open lines, and a strong center.' },
  { eco: 'C50', name: 'Italian Game: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], category: '1.e4', idea: 'Symmetrical development aiming for central control and kingside safety.' },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], category: '1.e4', idea: 'Develops the bishop to its most active diagonal eyeing the f7 pawn.' },
  { eco: 'C47', name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], category: '1.e4', idea: 'Solid symmetrical development favored for clean classical principles.' },
  { eco: 'C45', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'], category: '1.e4', idea: 'Immediately opens the center for active piece play and space advantage.' },
  { eco: 'C44', name: 'Scotch Opening', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], category: '1.e4', idea: 'Challenges Black’s central e5 pawn right on move three.' },
  { eco: 'C44', name: 'Ponziani Opening', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'c3'], category: '1.e4', idea: 'Prepares a full pawn center with d4 while sidestepping heavy mainlines.' },
  { eco: 'C42', name: "Petrov's Defense", moves: ['e4', 'e5', 'Nf3', 'Nf6'], category: '1.e4', idea: 'Classical counterattacking defense prized for structural soundness.' },
  { eco: 'C41', name: 'Philidor Defense', moves: ['e4', 'e5', 'Nf3', 'd6'], category: '1.e4', idea: 'Reinforces e5 solidly before preparing a queenside or central counterstrike.' },
  { eco: 'C33', name: "King's Gambit Accepted", moves: ['e4', 'e5', 'f4', 'exf4'], category: '1.e4', idea: 'Fierce romantic gambit trading a flank pawn for central dominance and an open f-file.' },
  { eco: 'C30', name: "King's Gambit", moves: ['e4', 'e5', 'f4'], category: '1.e4', idea: 'Attacks Black’s center aggressively from move two.' },
  { eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3'], category: '1.e4', idea: 'Flexible setup keeping f4 pawn breaks and sharp piece attacks in reserve.' },
  { eco: 'C23', name: "Bishop's Opening", moves: ['e4', 'e5', 'Bc4'], category: '1.e4', idea: 'Directly targets f7 while keeping the f-pawn free to advance.' },
  { eco: 'C21', name: 'Center Game', moves: ['e4', 'e5', 'd4'], category: '1.e4', idea: 'Immediate central confrontation leading to open lines.' },
  { eco: 'C20', name: "King's Pawn Game", moves: ['e4', 'e5'], category: '1.e4', idea: 'Classical open game fighting directly for central squares.' },

  // Sicilian Defense (B20-B99)
  { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], category: '1.e4', idea: 'The crown jewel of fighting defenses — dynamic, asymmetrical, and rich in counterattack.' },
  { eco: 'B70', name: 'Sicilian Defense: Dragon Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], category: '1.e4', idea: 'Fianchettoes the dark-squared bishop on g7 to unleash devastating diagonal pressure.' },
  { eco: 'B50', name: 'Sicilian Defense: Open', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'], category: '1.e4', idea: 'Open tactical battle where White has space and Black has the half-open c-file.' },
  { eco: 'B51', name: 'Sicilian Defense: Rossolimo / Moscow', moves: ['e4', 'c5', 'Nf3', 'd6', 'Bb5+'], category: '1.e4', idea: 'Positional anti-Sicilian sidestepping sharp Open Sicilian theory.' },
  { eco: 'B32', name: 'Sicilian Defense: Open', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4'], category: '1.e4', idea: 'Active piece struggle with imbalanced pawn structures.' },
  { eco: 'B30', name: 'Sicilian Defense: Rossolimo', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'], category: '1.e4', idea: 'Targets the c6 knight to create structural weaknesses.' },
  { eco: 'B23', name: 'Sicilian Defense: Closed', moves: ['e4', 'c5', 'Nc3'], category: '1.e4', idea: 'Strategic buildup aiming for a kingside pawn storm.' },
  { eco: 'B22', name: 'Sicilian Defense: Alapin Variation', moves: ['e4', 'c5', 'c3'], category: '1.e4', idea: 'Clean positional system preparing d4 with pawn recapture.' },
  { eco: 'B21', name: 'Sicilian Defense: Smith-Morra Gambit', moves: ['e4', 'c5', 'd4', 'cxd4', 'c3'], category: '1.e4', idea: 'Sacrifices a pawn for rapid development and open central files.' },
  { eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5'], category: '1.e4', idea: 'Asymmetrical fight for the d4 square and the most popular fighting answer to 1.e4.' },

  // French, Caro-Kann, Scandinavian, Pirc, Alekhine
  { eco: 'C11', name: 'French Defense: Classical', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'], category: '1.e4', idea: 'Solid pawn chain counterattacking White’s center with c5 and f6.' },
  { eco: 'C03', name: 'French Defense: Tarrasch Variation', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'], category: '1.e4', idea: 'Supports e4 without blocking the c-pawn, avoiding the Winawer pin.' },
  { eco: 'C02', name: 'French Defense: Advance Variation', moves: ['e4', 'e6', 'd4', 'd5', 'e5'], category: '1.e4', idea: 'Gains space on the kingside while Black attacks the d4 pawn chain base with c5.' },
  { eco: 'C01', name: 'French Defense: Exchange Variation', moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], category: '1.e4', idea: 'Symmetrical open e-file battle.' },
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6'], category: '1.e4', idea: 'Prepares ...d5 while keeping a rock-solid defensive structure.' },
  { eco: 'B13', name: 'Caro-Kann Defense: Exchange Variation', moves: ['e4', 'c6', 'd4', 'd5', 'exd5'], category: '1.e4', idea: 'Clarifies the center early, creating a Carlsbad-style minority attack structure.' },
  { eco: 'B12', name: 'Caro-Kann Defense: Advance Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5'], category: '1.e4', idea: 'Claims space while Black develops the light-squared bishop outside the pawn chain.' },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6'], category: '1.e4', idea: 'Ultra-reliable defense preparing ...d5 with strong endgame pawn structure.' },
  { eco: 'B01', name: 'Scandinavian Defense', moves: ['e4', 'd5'], category: '1.e4', idea: 'Immediately challenges the e4 pawn to open lines on move one.' },
  { eco: 'B07', name: 'Pirc Defense', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3'], category: '1.e4', idea: 'Hypermodern defense inviting White to build a center before undermining it.' },
  { eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6'], category: '1.e4', idea: 'Flexible fianchetto setup keeping piece placement uncommittal.' },
  { eco: 'B02', name: "Alekhine's Defense", moves: ['e4', 'Nf6'], category: '1.e4', idea: 'Provokes White’s central pawns forward to target them later.' },

  // Queen's Pawn Openings (D & E)
  { eco: 'D30', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'], category: '1.d4', idea: 'Classical fortress maintaining a central foothold on d5.' },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'], category: '1.d4', idea: 'Surrenders the center briefly to activate pieces freely and strike back with c5.' },
  { eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6'], category: '1.d4', idea: 'Defends d5 while keeping the c8-bishop diagonal open.' },
  { eco: 'D06', name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'], category: '1.d4', idea: 'Classic flank offer fighting to control the central e4 and d5 squares.' },
  { eco: 'D02', name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'], category: '1.d4', idea: 'Dependable universal system with a rock-solid pyramid and easy kingside attack plans.' },
  { eco: 'D00', name: 'London System', moves: ['d4', 'd5', 'Bf4'], category: '1.d4', idea: 'Develops the dark-squared bishop outside the pawn chain before playing e3.' },
  { eco: 'D02', name: 'London System', moves: ['d4', 'Nf6', 'Bf4'], category: '1.d4', idea: 'Flexible London setup against Indian defenses.' },
  { eco: 'D00', name: "Queen's Pawn Game", moves: ['d4', 'd5'], category: '1.d4', idea: 'Balanced classical battle for central control.' },

  // Indian Defenses (E & A)
  { eco: 'E60', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], category: '1.d4', idea: 'Dynamic counterattacking defense aiming for a fierce kingside pawn storm.' },
  { eco: 'D80', name: 'Grünfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], category: '1.d4', idea: 'Hypermodern strike targeting White’s center with a powerful g7 bishop.' },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], category: '1.d4', idea: 'Pins the c3 knight to control e4 and inflict structural damage.' },
  { eco: 'E12', name: "Queen's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], category: '1.d4', idea: 'Controls the e4 square via a queenside bishop fianchetto.' },
  { eco: 'E00', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'], category: '1.d4', idea: 'Combines Queen’s Gambit pressure with a long-term light-squared fianchetto.' },
  { eco: 'A60', name: 'Benoni Defense', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5'], category: '1.d4', idea: 'Creates an asymmetrical pawn structure with rich queenside counterplay.' },
  { eco: 'A45', name: 'Trompowsky Attack', moves: ['d4', 'Nf6', 'Bg5'], category: '1.d4', idea: 'Sidesteps Indian theory immediately by questioning the f6 knight.' },
  { eco: 'A45', name: 'Indian Defense', moves: ['d4', 'Nf6'], category: '1.d4', idea: 'Flexible control of e4 and d5 before committing central pawns.' },
  { eco: 'A80', name: 'Dutch Defense', moves: ['d4', 'f5'], category: '1.d4', idea: 'Combative flank fight for the e4 square and kingside attacking chances.' },

  // Flank Openings (A00-A39)
  { eco: 'A20', name: 'English Opening: Reversed Sicilian', moves: ['c4', 'e5'], category: 'Flank', idea: 'Plays a Sicilian Defense a full tempo up as White.' },
  { eco: 'A30', name: 'English Opening: Symmetrical', moves: ['c4', 'c5'], category: 'Flank', idea: 'Strategic flank battle fighting for the central d5 and d4 squares.' },
  { eco: 'A10', name: 'English Opening', moves: ['c4'], category: 'Flank', idea: 'Strategic flank opening fighting for d5 from the c-file.' },
  { eco: 'A09', name: 'Réti Opening', moves: ['Nf3', 'd5', 'c4'], category: 'Flank', idea: 'Hypermodern flank pressure undermining Black’s d5 pawn.' },
  { eco: 'A04', name: 'Réti Opening', moves: ['Nf3'], category: 'Flank', idea: 'Flexible knight development delaying central pawn commitments.' },
  { eco: 'A02', name: "Bird's Opening", moves: ['f4'], category: 'Flank', idea: 'Controls e5 from move one with a reversed Dutch structure.' },
  { eco: 'A01', name: 'Nimzowitsch-Larsen Attack', moves: ['b3'], category: 'Flank', idea: 'Fianchettoes the queenside bishop to exert long diagonal influence.' },
  { eco: 'A00', name: "King's Fianchetto Opening", moves: ['g3'], category: 'Flank', idea: 'Prepares Bg2 for flexible central control.' },

  // Single-move fallbacks
  { eco: 'B00', name: "King's Pawn Opening", moves: ['e4'], category: '1.e4', idea: 'Claims the center and opens lines for the queen and bishop.' },
  { eco: 'A40', name: "Queen's Pawn Opening", moves: ['d4'], category: '1.d4', idea: 'Establishes a protected central pawn on d4.' },
];

/** Curated showcase openings for the interactive Opening Explorer. */
export const FEATURED_OPENINGS: OpeningCatalogEntry[] = OPENINGS.filter(
  (o) =>
    o.moves.length >= 3 &&
    !o.name.includes("Scholar's") &&
    !o.name.includes("Fool's")
);

/**
 * Matches the longest known chess opening prefix against a SAN move sequence.
 * Executes in <0.1ms and returns null before move 1.
 */
export function detectOpening(moves: string[]): OpeningInfo | null {
  if (!moves || moves.length === 0) return null;

  let best: OpeningCatalogEntry | null = null;
  for (const entry of OPENINGS) {
    if (entry.moves.length > moves.length) continue;
    if (best && entry.moves.length <= best.moves.length) continue;

    let match = true;
    for (let i = 0; i < entry.moves.length; i++) {
      if (moves[i] !== entry.moves[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      best = entry;
    }
  }

  return best ? { eco: best.eco, name: best.name } : null;
}
