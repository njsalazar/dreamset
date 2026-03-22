/**
 * Big cleanup pass:
 * 1. Delete non-song entries (tuning, banter, interviews, etc.)
 * 2. Merge duplicate song variants
 */
import { createClient } from "@libsql/client/http";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function del(id: number) {
  await client.execute({ sql: "DELETE FROM show_songs WHERE song_id = ?", args: [id] });
  await client.execute({ sql: "DELETE FROM songs WHERE id = ?", args: [id] });
}

async function delByTitle(title: string) {
  const r = await client.execute({ sql: "SELECT id FROM songs WHERE title = ?", args: [title] });
  for (const row of r.rows as unknown as { id: number }[]) await del(row.id);
}

async function delByPattern(pattern: string) {
  const r = await client.execute({ sql: "SELECT id, title FROM songs WHERE title LIKE ?", args: [pattern] });
  const rows = r.rows as unknown as { id: number; title: string }[];
  for (const row of rows) {
    await del(row.id);
    console.log(`  Deleted: ${row.title}`);
  }
  return rows.length;
}

async function merge(keepId: number, dupeIds: number[]) {
  for (const dupeId of dupeIds) {
    await client.execute({
      sql: "UPDATE show_songs SET song_id = ? WHERE song_id = ? AND show_id NOT IN (SELECT show_id FROM show_songs WHERE song_id = ?)",
      args: [keepId, dupeId, keepId],
    });
    await client.execute({ sql: "DELETE FROM show_songs WHERE song_id = ?", args: [dupeId] });
    await client.execute({ sql: "DELETE FROM songs WHERE id = ?", args: [dupeId] });
  }
}

async function mergeByTitles(keepTitle: string, dupeTitles: string[]) {
  const kr = await client.execute({ sql: "SELECT id FROM songs WHERE title = ? LIMIT 1", args: [keepTitle] });
  const keepRows = kr.rows as unknown as { id: number }[];
  if (!keepRows.length) { console.log(`  WARN: keep title not found: ${keepTitle}`); return; }
  const keepId = keepRows[0].id;
  for (const dt of dupeTitles) {
    const dr = await client.execute({ sql: "SELECT id FROM songs WHERE title = ?", args: [dt] });
    const dupeRows = dr.rows as unknown as { id: number }[];
    for (const row of dupeRows) {
      await merge(keepId, [row.id]);
      console.log(`  Merged "${dt}" -> "${keepTitle}"`);
    }
  }
}

async function renameById(id: number, newTitle: string, newNorm: string) {
  await client.execute({ sql: "UPDATE songs SET title = ?, normalized_title = ? WHERE id = ?", args: [newTitle, newNorm, id] });
}

async function run() {
  console.log("=== PHASE 1: Delete non-songs ===\n");

  // Tuning variants
  let n = 0;
  n += await delByPattern("Tuning%");
  n += await delByPattern("%Tuning%");
  n += await delByPattern("Soundcheck%");
  n += await delByPattern("Monitor Check%");
  console.log(`Deleted ${n} tuning/soundcheck entries`);

  // Banter
  n = 0;
  n += await delByPattern("Stage Banter%");
  n += await delByPattern("Banter%");
  n += await delByPattern("%Banter%");
  console.log(`Deleted ${n} banter entries`);

  // Interviews
  n = await delByPattern("%Interview%");
  console.log(`Deleted ${n} interview entries`);

  // Intros/Outros
  n = 0;
  n += await delByPattern("%Intro%");
  n += await delByPattern("%Outro%");
  n += await delByPattern("Introduction%");
  n += await delByPattern("Introductions%");
  console.log(`Deleted ${n} intro/outro entries`);

  // Raps
  n = await delByPattern("%Rap%");
  console.log(`Deleted ${n} rap entries`);

  // Set markers
  n = 0;
  for (const t of ["SET1", "Encore", "Electric Set", "Electric Set 1", "Electric Set 2", "Electric Set 3",
    "Setlist Not Known", "Setlist unknown", "Setlist Not Known"]) {
    await delByTitle(t);
  }
  n += await delByPattern("Electric Set%");
  console.log(`Deleted set marker entries`);

  // Vince
  n = await delByPattern("Vince%");
  console.log(`Deleted ${n} Vince non-song entries`);

  // Jam/Noodle/Instrumental standalone (not song names)
  for (const t of ["Jam", "Jams", "Noodle", "Noodling", "Instrumental", "Instrumental 2",
    "Instrumental 3", "Sound Collage", "Music / Sound Collage", "Guitar Instrumental",
    "Improvmptu Blues", "Slow Blues", "Blues Jam", "Closing Jam"]) {
    await delByTitle(t);
  }

  // Happy Birthday variants
  n = await delByPattern("Happy Birthday%");
  console.log(`Deleted ${n} Happy Birthday entries`);

  // Countdown variants
  n = 0;
  n += await delByPattern("%Countdown%");
  n += await delByPattern("New Years Eve%");
  n += await delByPattern("Midnight Countdown%");
  console.log(`Deleted ${n} countdown entries`);

  // Unknown/unidentified
  n = 0;
  for (const t of ["Unknown", "Currently unknown", "Unidentified Instrumental",
    "Unknown Blues Instrumental", "Unknown Song - Pigpen Vocal"]) {
    await delByTitle(t);
  }
  console.log(`Deleted unknown entries`);

  // Misc non-songs
  for (const t of [
    "FM-announcers", "Prankster Electronics", "Phil & Ned", "Bonus track",
    "Crowd Chant", "Bob Weir comes on stage", "Announces that Jerry is sick",
    "Drummers join Vince Bob & Phil", "Drummers' Chant", "Drums and Phil",
    "Mickey on the beam with Phil", "Ken Babbs and harmonica", "Ken Kesey",
    "Ken Kesey Banter / New Years Countdown", "Ken Kesey's dialogue",
    "Michael McClure (poetry)", "Wavy Gravy Dedication", "Jerry & Vince Talking",
    "Jerrys breakdown", "Phil, Bob, Vince Jam", "Piano & Drum Machine",
    "Piano Ragtime Noodle Jam", "Beam & Percussion", "Basic Reading Work",
    "Get It Off The Ground Rap", "Rate The Record", "Pig Pen-Rap",
    "Solo Pigpen", "Who Cares? Pigpen rap", "Chord School",
    "My Dog Joke", "Yellow Dog Story", "Yellow Dog Story (part two)", "Yellow Dog Story(part one)",
    "Hamza el Din Set", "TC plays Bach", "Marriott USA",
    "Wham!", "Bull", "BIODTL", "TOO", "TLEO", "NFA", "Part I",
    "Seastones (Phil Lesh & Ned Lagin)", "Country Joe & The Fish",
    "Big Brother & the Holding Co.", "We're Sorry We're Not Playing Portchester Jam",
    "Goodnight jam", "Dear Prudence Jam", "Foxy Lady Jam",
    "Ghost Riders in the Sky Jam", "Louie Louie Jam",
    "Trip X", "UFO", "Ten",
  ]) {
    await delByTitle(t);
  }

  console.log("\n=== PHASE 2: Merge duplicates ===\n");

  // Mississippi Half-Step — keep "Mississippi Half-Step Uptown Toodeloo"
  await mergeByTitles("Mississippi Half-Step Uptown Toodeloo", [
    "Mississippi Half Step", "Mississippi Half Step Uptown Toodeloo",
    "Mississippi Half Step Uptown Toodlelo", "Mississippi Half Step Uptown Toodleloo",
    "Mississippi Half Step Uptwon Toodleloo", "Mississippi Half-Step",
    "Mississippi Half-Step (Uptown Toodeloo)", "Mississippi Half-Step (Uptown Toodleloo)",
    "Mississippi Half-Step Upton Toodleloo", "Mississippi Half-Step Uptown Toodleloo",
    "Mississippi Half-Step, Uptown Toodleloo", "Mississppi Half-Step Uptown Toodleloo",
    "Mississippi Half-Step Upton Toodleloo",
  ]);

  // Dancing in the Street — keep "Dancing In The Street"
  await mergeByTitles("Dancing In The Street", [
    "Dancin' In The Street", "Dancin In The Streets", "Dancin' In The Streets",
    "Dancing In The Streets", "Dancing in the Street",
  ]);

  // Turn On Your Love Light — keep "Turn On Your Love Light"
  await mergeByTitles("Turn On Your Love Light", [
    "Turn On Your Love Light,", "Turn On Your Love Light Jam",
    "Turn On Your Lovelight", "Turn On Your Lovelight (Reprise)",
    "Turn On Your Lovelight Jam", "Turn On Your Loveliight",
    "Turn On Your Love Lig", "Lovelight", "Lovelight Instrumental Jam",
  ]);

  // Good Morning Little Schoolgirl — keep "Good Morning Little Schoolgirl"
  await mergeByTitles("Good Morning Little Schoolgirl", [
    "Good Morning Little School Girl", "Good Morning, Little Schoolgirl",
    "Good Morning, Schoolgirl", "Good Mornin' Little Schoolgirl",
  ]);

  // Me & Bobby McGee
  await mergeByTitles("Me & Bobby McGee", [
    "Me And Bobby McGee", "Me And Bobbie McGee", "Bobby McGee", "Me & My Uncle Jam",
  ]);

  // Truckin'
  await mergeByTitles("Truckin'", [
    "Truckin", "Truckin' False Start",
  ]);

  // US Blues
  await mergeByTitles("U.S. Blues", [
    "U.S.Blues", "US Blues", "U.S. Blue",
  ]);

  // Cold Rain and Snow
  await mergeByTitles("Cold Rain And Snow", [
    "Cold Rain & Snow", "Cold Rain &Snow", "Cold, Rain and Snow",
  ]);

  // Samson & Delilah
  await mergeByTitles("Samson & Delilah", ["Samson And Delilah"]);

  // Around and Around
  await mergeByTitles("Around And Around", ["Around & Around"]);

  // Not Fade Away
  await mergeByTitles("Not Fade Away", [
    "Not Fade Away (Reprise)", "Not Fade Away tease", "Not Fade Away,",
  ]);

  // Dupree's Diamond Blues
  await mergeByTitles("Dupree's Diamond Blues", ["Duprees' Diamond Blues"]);

  // Playing In The Band
  await mergeByTitles("Playing In The Band", [
    "Playin In The Band", "Playin' In The Band", "Playin' Reprise",
    "Playing In The Band (Reprise)", "Playing In The Band Jam", "Playing In The Band Reprise",
  ]);

  // Goin' Down The Road
  await mergeByTitles("Goin' Down The Road Feelin' Bad", [
    "Goin' Down The Road Feeling Bad", "Goin' Down the Road Feeling Bad (coda)",
    "Going Down The Road Feelin' Bad", "Going Down The Road Feeling Bad",
    "Going Down the Road",
  ]);

  // Good Lovin'
  await mergeByTitles("Good Lovin'", [
    "Good Lovin", "Good Love", "Good Lov", "Good Lovin' Tease",
  ]);

  // Beat It On Down The Line
  await mergeByTitles("Beat It On Down The Line", [
    "Beat It On Down the Line", "Beat it On Down the Line",
    "Beat it on Down the Line", "Beat It On Down The Line (5 beats)",
    "Beat It On Down The Line,", "BIODTL",
  ]);

  // Mexicali Blues
  await mergeByTitles("Mexicali Blues", [
    "Mexicali Blue", "Mexicali Bluess", "Mexicalli Blues",
  ]);

  // Brown-Eyed Women
  await mergeByTitles("Brown-Eyed Women", [
    "Brown Eyed Women", "Brown-Eyed Woman",
  ]);

  // Black-Throated Wind
  await mergeByTitles("Black-Throated Wind", ["Black Throated Wind"]);

  // Baba O'Riley
  await mergeByTitles("Baba O'Riley", ["Baba O' Riley"]);

  // China Cat Sunflower
  await mergeByTitles("China Cat Sunflower", [
    "China Cat", "Chinacat Sunflower", "China Cat Sunflower-",
    "China Cat Sunflower Jam", "China Cat Jam",
  ]);

  // Jack-A-Roe
  await mergeByTitles("Jack-A-Roe", ["Jack A Roe", "Jack-A- Roe"]);

  // Jack Straw
  await mergeByTitles("Jack Straw", ["Jackstraw"]);

  // Smokestack Lightnin'
  await mergeByTitles("Smokestack Lightnin'", [
    "Smokestack Lightning", "Smokestack Lightning Jam",
  ]);

  // Caution — merge all into one
  await mergeByTitles("Caution (Do Not Stop on Tracks)", [
    "Caution", "Caution (Do Not Step On The Tracks)", "Caution (Do Not Step On Tracks)",
    "Caution (Do Not Stop On The Tracks)", "Caution (Do Not Stop On Tracks)  05-xx-68",
    "Caution (Don't Step On The Tracks)", "Caution (cut)", "Caution Jam",
    "Caution (Do Not Stop on Tracks) Jam",
  ]);

  // Scarlet Begonias
  await mergeByTitles("Scarlet Begonias", ["Scarlet Begonia's"]);

  // And We Bid You Goodnight
  await mergeByTitles("And We Bid You Goodnight", [
    "And We Bid You Good Night", "And We Bid You Goodbye", "We Bid You Good Night",
    "We Bid You Goodnight", "Bid You Goodnight Jam",
  ]);

  // Casey Jones
  await mergeByTitles("Casey Jones", ["Casey Jones.", "Casey Jones Dire Wolf"]);

  // Twist And Shout
  await mergeByTitles("Twist And Shout", ["Twist & Shout"]);

  // Doin' That Rag
  await mergeByTitles("Doin' That Rag", ["Doin That Rag", "Doin' That Rag Promo"]);

  // Franklin's Tower
  await mergeByTitles("Franklin's Tower", ["Franklin's Tower!"]);

  // New Minglewood Blues
  await mergeByTitles("New Minglewood Blues", ["New, New Minglewood Blues"]);

  // Peggy-O
  await mergeByTitles("Peggy-O", ["Peggy O"]);

  // Estimated Prophet
  await mergeByTitles("Estimated Prophet", ["Estimate Prophet", "Estimated Prophet Jam"]);

  // Mason's Children
  await mergeByTitles("Mason's Children", ["Mason'sChildren", "Masons' Children"]);

  // The Monkey & The Engineer
  await mergeByTitles("The Monkey & The Engineer", [
    "Monkey & The Engineer", "The Monkey And The Engineer",
  ]);

  // Cryptical Envelopment
  await mergeByTitles("Cryptical Envelopment", [
    "Cryptical", "Cryptical Envolopment", "Cryptical Reprise",
    "I. Cryptical Envelopment",
  ]);

  // The Other One
  await mergeByTitles("The Other One", [
    "The Other One (Reprise)", "The Other One Jam", "Other One 2nd Verse",
    "That's It For The Other One", "That's It For The Other One 11-01-68",
  ]);

  // Dark Star
  await mergeByTitles("Dark Star", ["Dark Star (Reprise)", "Dark Star Jam"]);

  // Slipknot!
  await mergeByTitles("Slipknot!", ["Slipknot"]);

  // Viola Lee Blues
  await mergeByTitles("Viola Lee Blues", ["Viola Lee Blues"]);

  // Stealin'
  await mergeByTitles("Stealin'", ["Stealin"]);

  // Searchin'
  await mergeByTitles("Searchin'", ["Searchin", "Searchin' Tease"]);

  // Don't Ease Me In (dupe)
  await mergeByTitles("Don't Ease Me In", ["Don't Ease Me In"]);

  // It's All Over Now Baby Blue
  await mergeByTitles("It's All Over Now, Baby Blue", [
    "It's All Over Now Baby Blue", "It\'s All Over Now Baby Blue",
  ]);

  // It's All Too Much (dupe)
  await mergeByTitles("It's All Too Much", ["It's All Too Much"]);

  // Iko Iko
  await mergeByTitles("Iko Iko", ["Iko, Iko"]);

  // Bird Song
  await mergeByTitles("Bird Song", ["Birdsong"]);

  // Lazy Lightnin'
  await mergeByTitles("Lazy Lightnin'", ["Lazy Lightning", "Lazy Lightning take"]);

  // Me & My Uncle
  await mergeByTitles("Me & My Uncle", ["Me And My Uncle"]);

  // Mountains of the Moon
  await mergeByTitles("Mountains Of The Moon", ["Mountains of The Moon"]);

  // Johnny B. Goode
  await mergeByTitles("Johnny B. Goode", ["Johnny B Goode"]);

  // So Many Roads
  await mergeByTitles("So Many Roads", ["So Many Road"]);

  // Louie Louie
  await mergeByTitles("Louie Louie", ["Louie, Louie"]);

  // Silver Threads
  await mergeByTitles("Silver Threads And Golden Needles", ["Silver Threads & Golden Needles"]);

  // Funiculi Funicula
  await mergeByTitles("Funiculi Funicula", ["Funicili Funicula", "Finiculi Finicula"]);

  // Walkin' Blues
  await mergeByTitles("Walkin' Blues", ["Walkin Blues", "Walking Blues"]);

  // Walking The Dog
  await mergeByTitles("Walkin' The Dog", ["Walking The Dog"]);

  // Feel Like A Stranger
  await mergeByTitles("Feel Like A Stranger", ["Feel Like A Strange"]);

  // Cumberland Blues
  await mergeByTitles("Cumberland Blues", ["Cumberland Bleus", "Cumberland Blues Monkey And The Engineer"]);

  // Death Don't Have No Mercy (dupe)
  await mergeByTitles("Death Don't Have No Mercy", ["Death Don't Have Mercy"]);

  // I Ain't Superstitious
  await mergeByTitles("I Ain't Superstitious", ["I Ain't Superstitous"]);

  // I Know You Rider
  await mergeByTitles("I Know You Rider", ["I Know Your Rider", "I Know You Rider (Fades in)"]);

  // Rubin & Cherise
  await mergeByTitles("Reuben & Cherise", ["Rubin & Cherise"]);

  // Warrior/Warriors of the Sun
  await mergeByTitles("Warriors Of The Sun", ["Warrior Of The Sun"]);

  // Addams Family (The prefix)
  await mergeByTitles("Addams Family", ["The Addam's Family", "Addam's Family / Take A Step Back"]);

  // Cecilia (trailing paren)
  await mergeByTitles("Cecilia", ["Cecilia)"]);

  // New Potato Caboose (date suffix)
  await mergeByTitles("New Potato Caboose", ["New Potato Caboose  08-22-68"]);

  // Star Spangled Banner
  await mergeByTitles("Star-Spangled Banner", ["Star Spangled Banner"]);

  // Ollin Arageed
  await mergeByTitles("Ollin Arageed", ["Ollin Arrageed"]);

  // Sittin' On Top Of The World
  await mergeByTitles("Sittin' On Top Of The World", [
    "Sitting On Top Of The World", "Sittin On Top Of The World", "Sittin On Top Of The World",
  ]);

  // That's Alright Mama
  await mergeByTitles("That's All Right Mama", ["That's Alright Mama"]);

  // Fire On The Mountain (trailing comma/punctuation)
  await mergeByTitles("Fire On The Mountain", ["Fire On The Mountain,", "Fire in the City"]);

  // Brokedown Palace
  await mergeByTitles("Brokedown Palace", ["Brokedown Palace,"]);

  // Greater Story Ever Told (trailing >)
  await mergeByTitles("Greatest Story Ever Told", ["Greatest Story Ever Told>"]);

  // New Speedway Boogie
  await mergeByTitles("New Speedway Boogie", ["New Speedway Boogie."]);

  // Attics of My Life
  await mergeByTitles("Attics Of My Life", ["Attics of My Life"]);

  // Alligator
  await mergeByTitles("Alligator", ["Alligator  05-xx-68", "Alligator Jam", "Alligator jam & reprise"]);

  // Born Cross-Eyed
  await mergeByTitles("Born Cross-Eyed", [
    "Born Cross Eyed", "Born Cross Eyed (Intro only)", "Born Cross-Eyed  01-17-68", "Born crosseyed",
  ]);

  // Matilda
  await mergeByTitles("Matilda", ["Mathilda"]);

  // Born On The Bayou
  await mergeByTitles("Born On The Bayou", []);

  // Uncle John's Band
  await mergeByTitles("Uncle John's Band", [
    "Uncle Johns Band", "Uncle Johns' Band",
    "Uncle John's Band - false start", "Uncle John's Band Jam", "Uncle John's Band Reprise",
  ]);

  // Feedback
  await mergeByTitles("Feedback", ["Feedback  11-01-68", "Feedback."]);

  // Sugar Magnolia
  await mergeByTitles("Sugar Magnolia", ["Sugar Magnolia Reprise"]);

  // Spanish Jam
  await mergeByTitles("Spanish Jam", ["Spanish Jam."]);

  // Taste Bud
  await mergeByTitles("Tastebud", ["Taste Bud"]);

  // I Just Wanna Make Love
  await mergeByTitles("I Just Want To Make Love To You", ["I Just Wanna Make Love To You"]);

  // Gentlemen Start Your Engines
  await mergeByTitles("Gentlemen, Start Your Engines", ["Gentlemen Start Your Engines"]);

  // Quinn The Eskimo
  await mergeByTitles("Quinn The Eskimo (The Mighty Quinn)", ["The Mighty Quinn (Quinn The Eskimo)"]);

  // Sunshine Daydream
  await mergeByTitles("Sunshine Daydream", ["Sunshinde Daydream"]);

  // Tears Of Rage -- not in list but checking
  // Deep Elem Blues
  await mergeByTitles("Deep Elem Blues", ["Deep Elem"]);

  // Donna Lee -> keep as is

  console.log("\n=== PHASE 3: Final dedup pass ===\n");
  const dupes = await client.execute(`
    SELECT normalized_title, MIN(id) as keep_id, GROUP_CONCAT(id) as all_ids
    FROM songs GROUP BY normalized_title HAVING COUNT(*) > 1
  `);
  const rows = dupes.rows as unknown as { normalized_title: string; keep_id: number; all_ids: string }[];
  console.log(`Found ${rows.length} remaining dupe groups`);
  for (const row of rows) {
    const keepId = Number(row.keep_id);
    const allIds = String(row.all_ids).split(",").map(Number).filter(id => id !== keepId);
    for (const dupeId of allIds) {
      await client.execute({ sql: "UPDATE show_songs SET song_id = ? WHERE song_id = ? AND show_id NOT IN (SELECT show_id FROM show_songs WHERE song_id = ?)", args: [keepId, dupeId, keepId] });
      await client.execute({ sql: "DELETE FROM show_songs WHERE song_id = ?", args: [dupeId] });
      await client.execute({ sql: "DELETE FROM songs WHERE id = ?", args: [dupeId] });
    }
  }

  const cnt = await client.execute("SELECT COUNT(*) as cnt FROM songs");
  const dc = await client.execute(`SELECT COUNT(*) as cnt FROM (SELECT normalized_title FROM songs GROUP BY normalized_title HAVING COUNT(*) > 1)`);
  const c = (cnt.rows as unknown as { cnt: number }[])[0];
  const d = (dc.rows as unknown as { cnt: number }[])[0];
  console.log(`\n✅ Done. Songs: ${c.cnt} | Dupes remaining: ${d.cnt}`);
}

run().catch(console.error);
