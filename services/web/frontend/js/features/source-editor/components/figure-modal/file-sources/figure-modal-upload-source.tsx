import { FC, useCallback, useEffect, useState } from 'react'
import { useFigureModalContext } from '../figure-modal-context'
import { useCurrentProjectFolders } from '../../../hooks/useCurrentProjectFolders'
import { File } from '../../../utils/file'
import { Dashboard, useUppy } from '@uppy/react'
import '@uppy/core/dist/style.css'
import '@uppy/dashboard/dist/style.css'
import { Uppy, UppyFile } from '@uppy/core'
import XHRUpload from '@uppy/xhr-upload'
import { refreshProjectMetadata } from '../../../../file-tree/util/api'
import { useProjectContext } from '../../../../../shared/context/project-context'
import Icon from '../../../../../shared/components/icon'
import classNames from 'classnames'
import { Button } from 'react-bootstrap'
import { FileRelocator } from '../file-relocator'

const maxFileSize = window.ExposedSettings.maxUploadSize

/* eslint-disable no-unused-vars */
export enum FileUploadStatus {
  ERROR,
  SUCCESS,
  NOT_ATTEMPTED,
  UPLOADING,
}
/* eslint-enable no-unused-vars */

export const FigureModalUploadFileSource: FC = () => {
  const { dispatch } = useFigureModalContext()
  const { _id: projectId } = useProjectContext()
  const [, rootFolder] = useCurrentProjectFolders()
  const [folder, setFolder] = useState<File | null>(null)
  const [nameDirty, setNameDirty] = useState<boolean>(false)
  // Files are immutable, so this will point to a (possibly) old version of the file
  const [file, setFile] = useState<UppyFile | null>(null)
  const [name, setName] = useState<string>('')
  const [uploading, setUploading] = useState<boolean>(false)
  const [uploadError, setUploadError] = useState<any>(null)

  const uppy = useUppy(() =>
    new Uppy({
      allowMultipleUploads: false,
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: maxFileSize || null,
        allowedFileTypes: ['image/*', '.pdf'],
      },
      autoProceed: false,
    })
      // use the basic XHR uploader
      .use(XHRUpload, {
        headers: {
          'X-CSRF-TOKEN': window.csrfToken,
        },
        // limit: maxConnections || 1,
        limit: 1,
        fieldName: 'qqfile', // "qqfile" field inherited from FineUploader
      })
  )

  const dispatchUploadAction = useCallback(
    (name?: string, file?: UppyFile | null, folder?: File | null) => {
      if (!name || !file) {
        dispatch({ getPath: undefined })
        return
      }
      dispatch({
        getPath: async () => {
          const uploadResult = await uppy.upload()
          if (!uploadResult.successful) {
            throw new Error('Upload failed')
          }
          const uploadFolder = folder ?? rootFolder
          return uploadFolder.path === '' && uploadFolder.name === 'rootFolder'
            ? `${name}`
            : `${uploadFolder.path ? uploadFolder.path + '/' : ''}${
                uploadFolder.name
              }/${name}`
        },
      })
    },
    [dispatch, rootFolder, uppy]
  )

  useEffect(() => {
    // broadcast doc metadata after each successful upload
    const onUploadSuccess = (_file: UppyFile, response: any) => {
      setUploading(false)
      if (response.body.entity_type === 'doc') {
        window.setTimeout(() => {
          refreshProjectMetadata(projectId, response.body.entity_id)
        }, 250)
      }
    }

    const onFileAdded = (file: UppyFile) => {
      const newName = nameDirty ? name : file.name
      setName(newName)
      setFile(file)
      dispatchUploadAction(newName, file, folder)
    }

    const onFileRemoved = () => {
      if (!nameDirty) {
        setName('')
      }
      setFile(null)
      dispatchUploadAction(undefined, null, folder)
    }

    const onUpload = () => {
      // Set endpoint dynamically https://github.com/transloadit/uppy/issues/1790#issuecomment-581402293
      setUploadError(null)
      uppy.getFiles().forEach(file => {
        uppy.setFileState(file.id, {
          // HACK: There seems to be no other way of renaming the underlying file object
          data: new globalThis.File([file.data], name),
          meta: {
            ...file.meta,
            name,
          },
          name,
          xhrUpload: {
            ...(file as any).xhrUpload,
            endpoint: `/project/${projectId}/upload?folder_id=${
              (folder ?? rootFolder).id
            }`,
          },
        })
      })
      setUploading(true)
    }

    // handle upload errors
    const onError = (_file: UppyFile, error: any, response: any) => {
      setUploading(false)
      setUploadError(error)
      switch (response?.status) {
        case 429:
          dispatch({
            error: 'Unable to process your file. Please try again later.',
          })
          break

        case 403:
          dispatch({ error: 'Your session has expired' })
          break

        default:
          dispatch({
            error: response?.body?.error ?? 'An unknown error occured',
          })
          break
      }
    }

    uppy
      .on('file-added', onFileAdded)
      .on('file-removed', onFileRemoved)
      .on('upload-success', onUploadSuccess)
      .on('upload', onUpload)
      .on('upload-error', onError)

    return () => {
      uppy
        .off('file-added', onFileAdded)
        .off('file-removed', onFileRemoved)
        .off('upload-success', onUploadSuccess)
        .off('upload', onUpload)
        .off('upload-error', onError)
    }
  }, [
    uppy,
    folder,
    rootFolder,
    name,
    nameDirty,
    dispatchUploadAction,
    projectId,
    file,
    dispatch,
  ])

  return (
    <>
      <div className="figure-modal-upload">
        {file ? (
          <FileContainer
            name={file.name}
            size={file.size}
            status={
              uploading
                ? FileUploadStatus.UPLOADING
                : uploadError
                ? FileUploadStatus.ERROR
                : FileUploadStatus.NOT_ATTEMPTED
            }
            onDelete={() => {
              uppy.removeFile(file.id)
              setFile(null)
              const newName = nameDirty ? name : ''
              setName(newName)
              dispatchUploadAction(newName, null, folder)
            }}
          />
        ) : (
          <Dashboard
            uppy={uppy}
            showProgressDetails
            height={120}
            width="100%"
            showLinkToFileUploadResult={false}
            proudlyDisplayPoweredByUppy={false}
            showSelectedFiles={false}
            hideUploadButton
            locale={{
              strings: {
                // Text to show on the droppable area.
                // `%{browseFiles}` is replaced with a link that opens the system file selection dialog.
                dropPasteFiles: `Drag here, paste an image, or %{browseFiles}`,
                // Used as the label for the link that opens the system file selection dialog.
                browseFiles: 'select from your computer',
              },
            }}
          />
        )}
      </div>
      <FileRelocator
        folder={folder}
        name={name}
        nameDisabled={!file && !nameDirty}
        onFolderChanged={item =>
          dispatchUploadAction(name, file, item ?? rootFolder)
        }
        onNameChanged={name => dispatchUploadAction(name, file, folder)}
        setFolder={setFolder}
        setName={setName}
        setNameDirty={setNameDirty}
      />
    </>
  )
}

export const FileContainer: FC<{
  name: string
  size?: number
  status: FileUploadStatus
  onDelete?: () => any
}> = ({ name, size, status, onDelete }) => {
  let icon
  switch (status) {
    case FileUploadStatus.ERROR:
      icon = 'times-circle'
      break
    case FileUploadStatus.SUCCESS:
      icon = 'check-circle'
      break
    case FileUploadStatus.NOT_ATTEMPTED:
      icon = 'picture-o'
      break
    case FileUploadStatus.UPLOADING:
      icon = 'spinner'
  }
  return (
    <div className="file-container">
      <div className="file-container-file">
        <Icon
          spin={status === FileUploadStatus.UPLOADING}
          type={icon}
          className={classNames(
            {
              'text-success': status === FileUploadStatus.SUCCESS,
              'text-danger': status === FileUploadStatus.ERROR,
            },
            'file-icon'
          )}
        />
        <div className="file-info">
          <span className="file-name">{name}</span>
          {size !== undefined && (
            <FileSize size={size} className="text-small" />
          )}
        </div>
        <Button
          bsStyle={null}
          className="btn btn-link p-0"
          onClick={() => onDelete && onDelete()}
        >
          <Icon fw type="times-circle" className="file-action file-icon" />
        </Button>
      </div>
    </div>
  )
}

const FileSize: FC<{ size: number; className?: string }> = ({
  size,
  className,
}) => {
  const BYTE_UNITS: [string, number][] = [
    ['B', 1],
    ['KB', 1e3],
    ['MB', 1e6],
    ['GB', 1e9],
    ['TB', 1e12],
    ['PB', 1e15],
  ]
  const labelIndex = Math.min(
    Math.floor(Math.log10(size) / 3),
    BYTE_UNITS.length - 1
  )

  const [label, bytesPerUnit] = BYTE_UNITS[labelIndex]
  const sizeInUnits = Math.round(size / bytesPerUnit)
  return (
    <span className={className}>
      {sizeInUnits} {label}
    </span>
  )
}