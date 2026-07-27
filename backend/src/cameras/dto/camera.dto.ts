import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateCameraDto {
  @ApiProperty({ example: 'CAM-05 Warehouse' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Warehouse - South Wall' })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiProperty({ example: 'rtsp://simulator:8554/cam1' })
  @IsString()
  @Matches(/^rtsps?:\/\//, { message: 'rtspUrl must start with rtsp:// or rtsps://' })
  rtspUrl: string;

  @ApiPropertyOptional({ description: 'Camera group id' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ example: '1280x720' })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  fps?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Re-encode to H.264 if source codec is not browser-safe' })
  @IsOptional()
  @IsBoolean()
  transcode?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  motionDetection?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  continuousRecording?: boolean;
}

export class UpdateCameraDto extends PartialType(CreateCameraDto) {}

export class CreateGroupDto {
  @ApiProperty({ example: 'Perimeter' })
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class TestConnectionDto {
  @ApiPropertyOptional({ description: 'RTSP URL to test; defaults to the saved camera URL' })
  @IsOptional()
  @IsString()
  rtspUrl?: string;
}
