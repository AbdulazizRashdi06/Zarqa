import {Composition, Folder, Still} from 'remotion';
import {FirstPost} from './FirstPost';
import {LaunchPost} from './launch/LaunchPost';
import {L_DURATION} from './launch/timing';
import {SLIDES} from './story/Slides';
import {DURATION} from './timing';
import './theme';

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition id="FirstPost" component={FirstPost} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
			<Composition id="LaunchPost" component={LaunchPost} durationInFrames={L_DURATION} fps={30} width={1080} height={1920} />
			{/* "Who is Zarqa?": a ten-slide Instagram carousel (4:5), rendered as stills. */}
			<Folder name="WhoIsZarqa">
				{SLIDES.map((Slide, i) => (
					<Still key={i} id={`WhoIsZarqa-${String(i + 1).padStart(2, '0')}`} component={Slide} width={1080} height={1350} />
				))}
			</Folder>
		</>
	);
};
