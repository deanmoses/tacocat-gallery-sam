import { processMediaUpload } from './processMediaUpload';
import * as imageProcessor from './processImageUpload';
import * as videoProcessor from './processVideoUpload';
import * as heicProcessor from './processHeicUpload';

jest.mock('./processImageUpload');
jest.mock('./processVideoUpload');
jest.mock('./processHeicUpload');

const mockProcessImageUpload = imageProcessor.processImageUpload as jest.MockedFunction<
    typeof imageProcessor.processImageUpload
>;
const mockProcessVideoUpload = videoProcessor.processVideoUpload as jest.MockedFunction<
    typeof videoProcessor.processVideoUpload
>;
const mockProcessHeicUpload = heicProcessor.processHeicUpload as jest.MockedFunction<
    typeof heicProcessor.processHeicUpload
>;

beforeEach(() => {
    jest.clearAllMocks();
    mockProcessImageUpload.mockResolvedValue(undefined);
    mockProcessVideoUpload.mockResolvedValue(undefined);
    mockProcessHeicUpload.mockResolvedValue('2024/06-15/photo.jpg');
});

describe('processMediaUpload()', () => {
    test('Routes JPG image to processImageUpload', async () => {
        await processMediaUpload('bucket', '2024/06-15/photo.jpg', 'version123');

        expect(mockProcessImageUpload).toHaveBeenCalledWith('bucket', '2024/06-15/photo.jpg', 'version123');
        expect(mockProcessVideoUpload).not.toHaveBeenCalled();
        expect(mockProcessHeicUpload).not.toHaveBeenCalled();
    });

    test('Routes HEIC to processHeicUpload', async () => {
        await processMediaUpload('bucket', '2024/06-15/photo.heic', 'version123');

        expect(mockProcessHeicUpload).toHaveBeenCalledWith('bucket', '2024/06-15/photo.heic');
        expect(mockProcessImageUpload).not.toHaveBeenCalled();
        expect(mockProcessVideoUpload).not.toHaveBeenCalled();
    });

    test('Routes HEIF to processHeicUpload', async () => {
        await processMediaUpload('bucket', '2024/06-15/photo.HEIF', 'version123');

        expect(mockProcessHeicUpload).toHaveBeenCalledWith('bucket', '2024/06-15/photo.HEIF');
        expect(mockProcessImageUpload).not.toHaveBeenCalled();
        expect(mockProcessVideoUpload).not.toHaveBeenCalled();
    });

    test('Routes MP4 video to processVideoUpload', async () => {
        await processMediaUpload('bucket', '2024/06-15/video.mp4', 'version123');

        expect(mockProcessVideoUpload).toHaveBeenCalledWith('bucket', '2024/06-15/video.mp4', 'version123');
        expect(mockProcessImageUpload).not.toHaveBeenCalled();
        expect(mockProcessHeicUpload).not.toHaveBeenCalled();
    });

    test('Routes MOV video to processVideoUpload', async () => {
        await processMediaUpload('bucket', '2024/06-15/video.mov', 'version123');

        expect(mockProcessVideoUpload).toHaveBeenCalledWith('bucket', '2024/06-15/video.mov', 'version123');
        expect(mockProcessImageUpload).not.toHaveBeenCalled();
        expect(mockProcessHeicUpload).not.toHaveBeenCalled();
    });
});
